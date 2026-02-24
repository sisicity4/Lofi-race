import { clamp, smoothDamp } from '../core/math';
import type { InputState, PhysicsEnv, VehicleParams, VehicleState } from '../types/game';

const DRIFT_MIN_SPEED = 7;
const DRIFT_MIN_SLIP = 0.22;
const DRIFT_CHARGE_MAX_MS = 1800;
const DRIFT_BOOST_MIN_CHARGE_MS = 260;

export class ArcadePhysics {
  step(state: VehicleState, input: InputState, params: VehicleParams, env: PhysicsEnv): void {
    const dt = env.dt;

    const sinYaw = Math.sin(state.yaw);
    const cosYaw = Math.cos(state.yaw);

    let forwardVel = state.velocityWorld.x * sinYaw + state.velocityWorld.z * cosYaw;
    let lateralVel = state.velocityWorld.x * cosYaw - state.velocityWorld.z * sinYaw;

    const offTrack = env.offTrack;
    const boostActive = state.driftBoostMs > 0;
    const boostMaxFactor = boostActive ? 1 + state.driftBoostStrength * 0.15 : 1;
    const maxSpeed = params.maxSpeed * (offTrack ? params.offTrackSpeedMultiplier : 1) * env.speedMultiplier * boostMaxFactor;
    const reverseMaxSpeed = params.reverseMaxSpeed;

    const accelSurfaceMultiplier = offTrack ? params.offTrackSpeedMultiplier : 1;
    let forwardAccel = input.throttle * params.accelForward * accelSurfaceMultiplier;
    if (boostActive && input.throttle > 0) {
      forwardAccel += params.accelForward * (0.65 + state.driftBoostStrength * 1.5);
    }
    if (input.brake > 0) {
      if (forwardVel > 1) {
        forwardAccel -= input.brake * params.brakeForce;
      } else {
        forwardAccel -= input.brake * params.reverseAccel * accelSurfaceMultiplier;
      }
    }

    forwardVel += forwardAccel * dt;

    const dragFactor = Math.max(0, 1 - params.drag * dt);
    const lateralDragFactor = input.handbrake ? Math.max(0, 1 - params.drag * dt * 0.45) : dragFactor;
    forwardVel *= dragFactor;
    lateralVel *= lateralDragFactor;

    const gripBase = input.handbrake ? params.driftGrip * 0.88 : params.lateralGrip;
    const grip = gripBase * (offTrack ? params.offTrackGripMultiplier : 1);
    const lateralDampT = clamp(grip * dt, 0, 1);
    lateralVel += (0 - lateralVel) * lateralDampT;

    state.steerVisual = smoothDamp(state.steerVisual, input.steer, params.steerRate, dt);
    const steerFactor = 1 / (1 + Math.abs(forwardVel) * params.steerAtSpeedCurve);
    const speedRatio = clamp(Math.abs(forwardVel) / Math.max(1, params.maxSpeed), 0, 1);
    const handbrakeSteerAssist = input.handbrake ? 1.28 : 1;
    const yawDelta =
      state.steerVisual *
      params.turnRateBase *
      handbrakeSteerAssist *
      steerFactor *
      (0.25 + speedRatio * 1.15) *
      Math.sign(forwardVel || 1) *
      dt;
    state.yaw += yawDelta;

    forwardVel = clamp(forwardVel, -reverseMaxSpeed, maxSpeed);

    const slipEstimate = Math.min(1.5, Math.abs(lateralVel) / Math.max(4, Math.abs(forwardVel)));
    const driftingNow =
      !offTrack &&
      input.handbrake &&
      input.throttle > 0.15 &&
      Math.abs(input.steer) > 0.12 &&
      Math.abs(forwardVel) > DRIFT_MIN_SPEED &&
      slipEstimate > DRIFT_MIN_SLIP;

    if (driftingNow) {
      state.driftActive = true;
      const chargeRate = 560 + speedRatio * 360 + clamp(slipEstimate, 0, 1.2) * 420;
      state.driftChargeMs = Math.min(DRIFT_CHARGE_MAX_MS, state.driftChargeMs + chargeRate * dt);
    } else {
      if (state.driftActive && !offTrack && state.driftChargeMs >= DRIFT_BOOST_MIN_CHARGE_MS) {
        const charge01 = clamp((state.driftChargeMs - DRIFT_BOOST_MIN_CHARGE_MS) / (DRIFT_CHARGE_MAX_MS - DRIFT_BOOST_MIN_CHARGE_MS), 0, 1);
        const nextBoostMs = 320 + charge01 * 980;
        const nextBoostStrength = 0.22 + charge01 * 0.68;
        state.driftBoostMs = Math.max(state.driftBoostMs, nextBoostMs);
        state.driftBoostStrength = Math.max(state.driftBoostStrength, nextBoostStrength);
      }
      state.driftActive = false;
      const chargeDecayRate = input.handbrake ? 420 : 1350;
      state.driftChargeMs = Math.max(0, state.driftChargeMs - chargeDecayRate * dt);
    }

    if (state.driftBoostMs > 0) {
      state.driftBoostMs = Math.max(0, state.driftBoostMs - dt * 1000 * (input.throttle > 0 ? 1 : 1.25));
      if (state.driftBoostMs <= 0) {
        state.driftBoostStrength = 0;
      }
    }

    const sinNew = Math.sin(state.yaw);
    const cosNew = Math.cos(state.yaw);
    state.velocityWorld.x = sinNew * forwardVel + cosNew * lateralVel;
    state.velocityWorld.z = cosNew * forwardVel - sinNew * lateralVel;

    state.position.x += state.velocityWorld.x * dt;
    state.position.z += state.velocityWorld.z * dt;
    state.speedForward = forwardVel;
    state.slipRatio = slipEstimate;
    state.position.y = 0;
  }

  resolveCollision(a: VehicleState, aRadius: number, b: VehicleState, bRadius: number, damping: number): number {
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const distSq = dx * dx + dz * dz;
    const minDist = aRadius + bRadius;
    if (distSq <= 1e-9 || distSq >= minDist * minDist) return 0;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = minDist - dist;

    a.position.x -= nx * overlap * 0.5;
    a.position.z -= nz * overlap * 0.5;
    b.position.x += nx * overlap * 0.5;
    b.position.z += nz * overlap * 0.5;

    const rvx = b.velocityWorld.x - a.velocityWorld.x;
    const rvz = b.velocityWorld.z - a.velocityWorld.z;
    const relNormalSpeed = rvx * nx + rvz * nz;

    if (relNormalSpeed < 0) {
      const impulse = -(1 + 0.25) * relNormalSpeed * 0.5;
      a.velocityWorld.x -= nx * impulse * damping;
      a.velocityWorld.z -= nz * impulse * damping;
      b.velocityWorld.x += nx * impulse * damping;
      b.velocityWorld.z += nz * impulse * damping;
      return Math.abs(impulse);
    }

    return overlap;
  }
}

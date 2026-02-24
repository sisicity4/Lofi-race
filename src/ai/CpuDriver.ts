import { angleWrap, clamp } from '../core/math';
import type { InputState, VehicleState } from '../types/game';
import type { TrackProgress } from '../track/TrackProgress';

export interface CpuDriverContext {
  trackProgress: TrackProgress;
  vehicle: VehicleState;
  allVehicles: VehicleState[];
  speedMultiplier: number;
}

export class CpuDriver {
  update({ trackProgress, vehicle, allVehicles, speedMultiplier }: CpuDriverContext): InputState {
    const sample = trackProgress.sample({ x: vehicle.position.x, z: vehicle.position.z });
    const lookAheadSteps = Math.min(6, 2 + Math.floor(Math.abs(vehicle.speedForward) / 12));
    const targetIndex = (sample.waypointIndex + lookAheadSteps) % trackProgress.waypointCount();
    const target = trackProgress.getTrack().waypoints[targetIndex];

    const dx = target.x - vehicle.position.x;
    const dz = target.z - vehicle.position.z;
    const desiredYaw = Math.atan2(dx, dz);
    const deltaYaw = angleWrap(desiredYaw - vehicle.yaw);
    const steer = clamp(deltaYaw / 0.8, -1, 1);

    const cornerSharpness = Math.min(1, Math.abs(deltaYaw) / 1.15);
    const targetSpeedBase = target.targetSpeed * 1.14;
    const targetSpeed = Math.max(11, targetSpeedBase * speedMultiplier * (1 - cornerSharpness * 0.14));
    const speed = Math.max(0, vehicle.speedForward);

    let throttle = 0;
    let brake = 0;
    if (speed < targetSpeed - 1.2) {
      throttle = clamp((targetSpeed - speed) / 8, 0.4, 1);
    } else if (speed > targetSpeed + 1.4) {
      brake = clamp((speed - targetSpeed) / 8, 0.15, 1);
    }

    const handbrake = speed > 20 && Math.abs(deltaYaw) > 0.88;

    for (const other of allVehicles) {
      if (other.id === vehicle.id) continue;
      const odx = other.position.x - vehicle.position.x;
      const odz = other.position.z - vehicle.position.z;
      const distSq = odx * odx + odz * odz;
      if (distSq > 36) continue;
      const angleToOther = Math.atan2(odx, odz);
      const frontDelta = Math.abs(angleWrap(angleToOther - vehicle.yaw));
      if (frontDelta < 0.55) {
        brake = Math.max(brake, 0.65);
        throttle = Math.min(throttle, 0.35);
      }
    }

    return {
      throttle,
      brake,
      steer,
      handbrake,
      reset: false,
      pause: false,
      mute: false,
    };
  }
}

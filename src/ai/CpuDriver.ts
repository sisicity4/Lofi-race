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
    const steer = clamp(deltaYaw / 0.74, -1, 1);

    const cornerSharpness = Math.min(1, Math.abs(deltaYaw) / 1.15);
    const targetSpeedBase = target.targetSpeed * 1.24;
    const targetSpeed = Math.max(13, targetSpeedBase * speedMultiplier * (1 - cornerSharpness * 0.09));
    const speed = Math.max(0, vehicle.speedForward);

    let throttle = 0;
    let brake = 0;
    if (speed < targetSpeed - 0.9) {
      throttle = clamp((targetSpeed - speed) / 7.2, 0.52, 1);
    } else if (speed > targetSpeed + 2.2) {
      brake = clamp((speed - targetSpeed) / 9.2, 0.12, 1);
    }

    const handbrake = speed > 24 && Math.abs(deltaYaw) > 1.04;

    for (const other of allVehicles) {
      if (other.id === vehicle.id) continue;
      const odx = other.position.x - vehicle.position.x;
      const odz = other.position.z - vehicle.position.z;
      const distSq = odx * odx + odz * odz;
      if (distSq > 30.25) continue;
      const angleToOther = Math.atan2(odx, odz);
      const frontDelta = Math.abs(angleWrap(angleToOther - vehicle.yaw));
      if (frontDelta < 0.55) {
        brake = Math.max(brake, 0.42);
        throttle = Math.min(throttle, 0.58);
      }
    }

    return {
      throttle,
      brake,
      steer,
      handbrake,
      boost: false,
      pause: false,
      mute: false,
    };
  }
}

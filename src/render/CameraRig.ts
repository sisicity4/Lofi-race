import * as THREE from 'three';
import { clamp, lerp, smoothDamp } from '../core/math';
import type { VehicleState } from '../types/game';

export interface CameraFxOptions {
  active?: boolean;
  intensity01?: number;
  shake01?: number;
  speedFx01?: number;
  driftFx01?: number;
}

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly rollAxis = new THREE.Vector3();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly shakeOffset = new THREE.Vector3();
  private roll = 0;
  private shakeTimeSec = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  update(
    target: VehicleState | null,
    dtSec: number,
    fx: CameraFxOptions = { active: false, intensity01: 0 },
  ): void {
    if (!target) return;

    const speed = Math.abs(target.speedForward);
    const speedFx01 = clamp(fx.speedFx01 ?? speed / 50, 0, 1);
    const driftFx01 = clamp(fx.driftFx01 ?? 0, 0, 1);
    const overdriveActive = fx.active ?? false;
    const overdriveIntensity = clamp(fx.intensity01 ?? 0, 0, 1);
    const distance = lerp(8.5, 12.4, speedFx01) + (overdriveActive ? lerp(0.9, 2.3, overdriveIntensity) : 0);
    const height = lerp(4.5, 6.0, speedFx01) - (overdriveActive ? lerp(0.25, 0.9, overdriveIntensity) : 0) - driftFx01 * 0.18;
    const yaw = target.yaw;

    this.tmpForward.set(Math.sin(yaw), 0, Math.cos(yaw));

    this.desiredPosition.set(
      target.position.x - this.tmpForward.x * distance,
      height,
      target.position.z - this.tmpForward.z * distance,
    );

    const pos = this.camera.position;
    const followXz = overdriveActive ? lerp(8.4, 10.8, overdriveIntensity) : 7.5 + speedFx01 * 0.8;
    const followY = overdriveActive ? lerp(7.2, 9.2, overdriveIntensity) : 6.8;
    pos.x = smoothDamp(pos.x, this.desiredPosition.x, followXz, dtSec);
    pos.y = smoothDamp(pos.y, this.desiredPosition.y, followY, dtSec);
    pos.z = smoothDamp(pos.z, this.desiredPosition.z, followXz, dtSec);

    const shake01 = clamp(fx.shake01 ?? 0, 0, 1);
    this.shakeTimeSec += dtSec * (1 + shake01 * 2.4);
    if (shake01 > 0.001) {
      const amp = shake01 * shake01 * 0.34;
      this.shakeOffset.set(
        Math.sin(this.shakeTimeSec * 47.0) * amp + Math.sin(this.shakeTimeSec * 83.0) * amp * 0.28,
        Math.cos(this.shakeTimeSec * 59.0) * amp * 0.38,
        Math.cos(this.shakeTimeSec * 41.0) * amp,
      );
      pos.add(this.shakeOffset);
    }

    this.lookAt.set(
      target.position.x + this.tmpForward.x * 3,
      1.4,
      target.position.z + this.tmpForward.z * 3,
    );
    this.camera.lookAt(this.lookAt);

    const baseFov = lerp(60, 70.5, speedFx01);
    const overdriveBoost = overdriveActive ? lerp(6, 12, overdriveIntensity) : 0;
    const driftBoost = driftFx01 * 1.8;
    const targetFov = clamp(baseFov + overdriveBoost + driftBoost, 60, 84);
    const fovSmoothing = overdriveActive ? lerp(13, 17, overdriveIntensity) : 8.5 + speedFx01;
    this.camera.fov = smoothDamp(this.camera.fov, targetFov, fovSmoothing, dtSec);
    const targetRoll = clamp(
      target.steerVisual * -0.012 + target.slipRatio * 0.018 * Math.sign(target.steerVisual || 1) + driftFx01 * 0.008 * Math.sign(target.steerVisual || 1),
      -0.03,
      0.03,
    );
    this.roll = smoothDamp(this.roll, targetRoll, 7, dtSec);
    if (Math.abs(this.roll) > 0.0001) {
      this.rollAxis.copy(this.lookAt).sub(this.camera.position).normalize();
      this.rollQuat.setFromAxisAngle(this.rollAxis, this.roll);
      this.camera.quaternion.multiply(this.rollQuat);
    }
    this.camera.updateProjectionMatrix();
  }
}

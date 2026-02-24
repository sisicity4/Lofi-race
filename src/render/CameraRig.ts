import * as THREE from 'three';
import { clamp, lerp, smoothDamp } from '../core/math';
import type { VehicleState } from '../types/game';

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly rollAxis = new THREE.Vector3();
  private readonly rollQuat = new THREE.Quaternion();
  private roll = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  update(target: VehicleState | null, dtSec: number): void {
    if (!target) return;

    const speed = Math.abs(target.speedForward);
    const distance = lerp(8.5, 11.8, clamp(speed / 42, 0, 1));
    const height = lerp(4.5, 6.2, clamp(speed / 42, 0, 1));
    const yaw = target.yaw;

    this.tmpForward.set(Math.sin(yaw), 0, Math.cos(yaw));

    this.desiredPosition.set(
      target.position.x - this.tmpForward.x * distance,
      height,
      target.position.z - this.tmpForward.z * distance,
    );

    const pos = this.camera.position;
    pos.x = smoothDamp(pos.x, this.desiredPosition.x, 7.5, dtSec);
    pos.y = smoothDamp(pos.y, this.desiredPosition.y, 6.8, dtSec);
    pos.z = smoothDamp(pos.z, this.desiredPosition.z, 7.5, dtSec);

    this.lookAt.set(
      target.position.x + this.tmpForward.x * 3,
      1.4,
      target.position.z + this.tmpForward.z * 3,
    );
    this.camera.lookAt(this.lookAt);

    const targetFov = lerp(60, 69, clamp(speed / 50, 0, 1));
    this.camera.fov = smoothDamp(this.camera.fov, targetFov, 9, dtSec);
    const targetRoll = clamp(target.steerVisual * -0.012 + target.slipRatio * 0.018 * Math.sign(target.steerVisual || 1), -0.022, 0.022);
    this.roll = smoothDamp(this.roll, targetRoll, 7, dtSec);
    if (Math.abs(this.roll) > 0.0001) {
      this.rollAxis.copy(this.lookAt).sub(this.camera.position).normalize();
      this.rollQuat.setFromAxisAngle(this.rollAxis, this.roll);
      this.camera.quaternion.multiply(this.rollQuat);
    }
    this.camera.updateProjectionMatrix();
  }
}

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../../src/render/CameraRig';
import type { VehicleState } from '../../src/types/game';

function createVehicleState(): VehicleState {
  return {
    id: 'player',
    name: 'YOU',
    isPlayer: true,
    colorHex: 0xff335f,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    velocityWorld: { x: 0, y: 0, z: 0 },
    speedForward: 28,
    steerVisual: 0,
    slipRatio: 0,
    driftActive: false,
    driftChargeMs: 0,
    driftBoostMs: 0,
    driftBoostStrength: 0,
    isOffTrack: false,
    lap: 0,
    checkpointIndex: 0,
    progress01: 0,
    progressMetric: 0,
    finished: false,
    finishOrder: null,
    lapTimesMs: [],
    currentLapMs: 0,
    resetCooldownMs: 0,
    respawnWaypointIndex: 0,
    outOfBoundsState: 'none',
    outOfBoundsRespawnMs: 0,
    oobCooldownMs: 0,
    lastSafePosition: { x: 0, y: 0, z: 0 },
    lastSafeYaw: 0,
    hasLastSafePose: false,
    lastSafeRespawnWaypointIndex: 0,
  };
}

describe('CameraRig overdrive FOV', () => {
  it('increases FOV noticeably while overdrive is active', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const rig = new CameraRig(camera);
    const state = createVehicleState();

    for (let i = 0; i < 30; i += 1) {
      rig.update(state, 1 / 60, { active: false, intensity01: 0 });
    }
    const baseFov = camera.fov;

    for (let i = 0; i < 30; i += 1) {
      rig.update(state, 1 / 60, { active: true, intensity01: 1 });
    }
    const overdriveFov = camera.fov;

    expect(overdriveFov).toBeGreaterThan(baseFov + 4);
  });

  it('smoothly returns toward normal FOV after overdrive ends', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const rig = new CameraRig(camera);
    const state = createVehicleState();

    for (let i = 0; i < 28; i += 1) {
      rig.update(state, 1 / 60, { active: true, intensity01: 0.9 });
    }
    const boostedFov = camera.fov;

    for (let i = 0; i < 35; i += 1) {
      rig.update(state, 1 / 60, { active: false, intensity01: 0 });
    }

    expect(camera.fov).toBeLessThan(boostedFov);
  });
});

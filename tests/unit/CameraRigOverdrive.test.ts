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

  it('applies shake offset and settles back when shake input stops', () => {
    const baselineCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const shakenCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const baselineRig = new CameraRig(baselineCamera);
    const shakenRig = new CameraRig(shakenCamera);
    const state = createVehicleState();
    state.speedForward = 34;

    for (let i = 0; i < 12; i += 1) {
      baselineRig.update(state, 1 / 60, { shake01: 0, speedFx01: 0.7 });
      shakenRig.update(state, 1 / 60, { shake01: 0, speedFx01: 0.7 });
    }

    baselineRig.update(state, 1 / 60, { shake01: 0, speedFx01: 0.7 });
    shakenRig.update(state, 1 / 60, { shake01: 1, speedFx01: 0.7 });
    const shakenDelta = baselineCamera.position.distanceTo(shakenCamera.position);
    expect(shakenDelta).toBeGreaterThan(0.03);

    for (let i = 0; i < 90; i += 1) {
      baselineRig.update(state, 1 / 60, { shake01: 0, speedFx01: 0.7 });
      shakenRig.update(state, 1 / 60, { shake01: 0, speedFx01: 0.7 });
    }

    expect(shakenCamera.position.distanceTo(baselineCamera.position)).toBeLessThan(0.02);
  });
});

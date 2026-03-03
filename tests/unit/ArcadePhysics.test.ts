import { describe, expect, it } from 'vitest';
import { ArcadePhysics } from '../../src/vehicle/ArcadePhysics';
import { DEFAULT_VEHICLE_PARAMS } from '../../src/data/config';
import type { InputState, VehicleState } from '../../src/types/game';

function createState(): VehicleState {
  return {
    id: 'p',
    name: 'P',
    isPlayer: true,
    colorHex: 0,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    velocityWorld: { x: 0, y: 0, z: 20 },
    speedForward: 20,
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
    hasLastSafePose: true,
    lastSafeRespawnWaypointIndex: 0,
  };
}

const noInput: InputState = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, pause: false, mute: false };

describe('ArcadePhysics', () => {
  it('decelerates when no input is applied', () => {
    const physics = new ArcadePhysics();
    const state = createState();
    physics.step(state, noInput, DEFAULT_VEHICLE_PARAMS, { dt: 1 / 60, surface: 'road', offTrack: false, speedMultiplier: 1 });
    expect(state.speedForward).toBeLessThan(20);
  });

  it('limits effective speed more on off-track surface', () => {
    const physics = new ArcadePhysics();
    const onRoad = createState();
    const offRoad = createState();
    const accelInput: InputState = { ...noInput, throttle: 1 };
    for (let i = 0; i < 180; i += 1) {
      physics.step(onRoad, accelInput, DEFAULT_VEHICLE_PARAMS, { dt: 1 / 60, surface: 'road', offTrack: false, speedMultiplier: 1 });
      physics.step(offRoad, accelInput, DEFAULT_VEHICLE_PARAMS, { dt: 1 / 60, surface: 'grass', offTrack: true, speedMultiplier: 1 });
    }
    expect(onRoad.speedForward).toBeGreaterThan(offRoad.speedForward);
  });

  it('grants a short boost after releasing a sustained drift', () => {
    const physics = new ArcadePhysics();
    const state = createState();
    state.velocityWorld = { x: 6, y: 0, z: 22 };
    state.speedForward = 22;
    const driftInput: InputState = { ...noInput, throttle: 1, steer: 1, handbrake: true };
    state.driftActive = true;
    state.driftChargeMs = 900;
    physics.step(state, driftInput, DEFAULT_VEHICLE_PARAMS, { dt: 1 / 60, surface: 'road', offTrack: false, speedMultiplier: 1 });
    physics.step(state, { ...driftInput, handbrake: false }, DEFAULT_VEHICLE_PARAMS, { dt: 1 / 60, surface: 'road', offTrack: false, speedMultiplier: 1 });
    expect(state.driftBoostMs).toBeGreaterThan(0);
    expect(state.driftBoostStrength).toBeGreaterThan(0);
  });
});

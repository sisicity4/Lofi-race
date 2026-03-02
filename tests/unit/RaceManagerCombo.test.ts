import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { DEFAULT_GAME_CONFIG, DEFAULT_VEHICLE_PARAMS } from '../../src/data/config';
import type { GameEvents } from '../../src/game/GameState';
import { RaceManager } from '../../src/game/RaceManager';
import { createFallbackCoastalTrack } from '../../src/track/TrackLoader';
import type { InputState } from '../../src/types/game';

const NO_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  pause: false,
  mute: false,
};

function advanceToRacing(raceManager: RaceManager): void {
  raceManager.startRace();
  raceManager.update(1.0, NO_INPUT);
  raceManager.update(1.0, NO_INPUT);
  raceManager.update(1.0, NO_INPUT);
  expect(raceManager.getPhase()).toBe('racing');
}

function forceStraightComboFrame(raceManager: RaceManager, waypointIndex = 0): void {
  const track = raceManager.trackProgress.getTrack();
  const player = raceManager.getPlayerVehicle();
  const curr = track.waypoints[waypointIndex % track.waypoints.length];
  const next = track.waypoints[(waypointIndex + 1) % track.waypoints.length];
  const dx = next.x - curr.x;
  const dz = next.z - curr.z;
  const len = Math.hypot(dx, dz) || 1;
  const tx = dx / len;
  const tz = dz / len;
  const speed = 34;

  player.position.x = curr.x;
  player.position.z = curr.z;
  player.yaw = Math.atan2(tx, tz);
  player.velocityWorld.x = tx * speed;
  player.velocityWorld.z = tz * speed;
  player.speedForward = speed;
  player.steerVisual = 0;
  player.slipRatio = 0;
  player.driftActive = false;
  player.isOffTrack = false;
}

function movePlayerToLateralDistance(raceManager: RaceManager, waypointIndex: number, lateralDistance: number): void {
  const player = raceManager.getPlayerVehicle();
  const wp = raceManager.trackProgress.getTrack().waypoints[waypointIndex];
  const sample = raceManager.trackProgress.sample({ x: wp.x, z: wp.z });
  const normal = { x: -sample.tangent.z, z: sample.tangent.x };
  player.position.x = sample.nearestPoint.x + normal.x * lateralDistance;
  player.position.z = sample.nearestPoint.z + normal.z * lateralDistance;
  player.velocityWorld.x = 0;
  player.velocityWorld.z = 0;
  player.speedForward = 0;
}

function movePlayerToAtLeastDistance(raceManager: RaceManager, waypointIndex: number, minDistance: number): number {
  let attemptDistance = minDistance;
  let actualDistance = 0;
  for (let i = 0; i < 10; i += 1) {
    movePlayerToLateralDistance(raceManager, waypointIndex, attemptDistance);
    const player = raceManager.getPlayerVehicle();
    actualDistance = raceManager.trackProgress.sample({ x: player.position.x, z: player.position.z }).distance;
    if (actualDistance >= minDistance) {
      return actualDistance;
    }
    attemptDistance += Math.max(1, (minDistance - actualDistance) + 0.75);
  }
  return actualDistance;
}

describe('RaceManager auto combo', () => {
  it('builds combo automatically on sustained straight high speed', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    let maxCombo = 0;
    let maxSpeedMultiplier = 1;
    for (let i = 0; i < 280; i += 1) {
      forceStraightComboFrame(raceManager, i % 6);
      raceManager.update(1 / 60, NO_INPUT);
      const race = raceManager.getSnapshot().race;
      maxCombo = Math.max(maxCombo, race.comboLevel);
      maxSpeedMultiplier = Math.max(maxSpeedMultiplier, race.comboSpeedMultiplier);
    }

    const snapshot = raceManager.getSnapshot();
    expect(maxCombo).toBeGreaterThan(0);
    expect(snapshot.race.maxCombo).toBeGreaterThanOrEqual(maxCombo);
    expect(maxSpeedMultiplier).toBeGreaterThan(1);
    expect(snapshot.race.comboSource === 'straight' || snapshot.race.comboLevel > 0).toBe(true);
    expect(snapshot.race.comboMeter01).toBeGreaterThanOrEqual(0);
  });

  it('resets combo when player goes out-of-bounds', () => {
    const track = createFallbackCoastalTrack();
    const raceManager = new RaceManager({
      track,
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    let maxCombo = 0;
    for (let i = 0; i < 280; i += 1) {
      forceStraightComboFrame(raceManager, i % 6);
      raceManager.update(1 / 60, NO_INPUT);
      maxCombo = Math.max(maxCombo, raceManager.getSnapshot().race.comboLevel);
    }
    expect(maxCombo).toBeGreaterThan(0);

    const wp = track.waypoints[0];
    const sample = raceManager.trackProgress.sample({ x: wp.x, z: wp.z });
    const baseLimit = sample.width * 0.5 + track.hardBoundaryMargin;
    const expandedWallLimit = baseLimit + 2.5;
    const actual = movePlayerToAtLeastDistance(raceManager, 0, expandedWallLimit + 0.5);
    expect(actual).toBeGreaterThanOrEqual(expandedWallLimit + 0.5);

    raceManager.update(1 / 60, NO_INPUT);

    const snapshot = raceManager.getSnapshot();
    expect(snapshot.race.comboLevel).toBe(0);
    expect(snapshot.race.comboMeter01).toBe(0);
    expect(snapshot.race.comboSource).toBe('none');
    expect(snapshot.race.maxCombo).toBe(maxCombo);
  });
});

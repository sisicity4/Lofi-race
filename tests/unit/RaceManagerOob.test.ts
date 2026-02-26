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

describe('RaceManager out-of-bounds', () => {
  it('allows a player-only buffer beyond CPU wall before triggering OOB', () => {
    const track = createFallbackCoastalTrack();
    const raceManager = new RaceManager({
      track,
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    const wp = track.waypoints[0];
    const sample = raceManager.trackProgress.sample({ x: wp.x, z: wp.z });
    const baseLimit = sample.width * 0.5 + track.hardBoundaryMargin;
    const expandedWallLimit = baseLimit + 2.5;
    const bufferDistance = baseLimit + (expandedWallLimit - baseLimit) * 0.55;

    const actual = movePlayerToAtLeastDistance(raceManager, 0, bufferDistance);
    expect(actual).toBeGreaterThanOrEqual(bufferDistance);
    raceManager.update(1 / 60, NO_INPUT);

    const player = raceManager.getPlayerVehicle();
    expect(player.outOfBoundsState).toBe('none');
  });

  it('triggers wall-contact OOB and respawns at the last safe pose after ~2s', () => {
    const track = createFallbackCoastalTrack();
    const eventBus = new EventBus<GameEvents>();
    const raceManager = new RaceManager({
      track,
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus,
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    const oobEvents: GameEvents['car:oob'][] = [];
    const respawnEvents: GameEvents['car:respawned'][] = [];
    eventBus.on('car:oob', (payload) => oobEvents.push(payload));
    eventBus.on('car:respawned', (payload) => respawnEvents.push(payload));

    const player = raceManager.getPlayerVehicle();
    player.lastSafePosition.x = player.position.x;
    player.lastSafePosition.y = player.position.y;
    player.lastSafePosition.z = player.position.z;
    player.lastSafeYaw = player.yaw;
    player.hasLastSafePose = true;
    player.lastSafeRespawnWaypointIndex = player.respawnWaypointIndex;
    const safePose = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
    };

    const wp = track.waypoints[0];
    const sample = raceManager.trackProgress.sample({ x: wp.x, z: wp.z });
    const baseLimit = sample.width * 0.5 + track.hardBoundaryMargin;
    const expandedWallLimit = baseLimit + 2.5;
    const actual = movePlayerToAtLeastDistance(raceManager, 0, expandedWallLimit + 0.5);
    expect(actual).toBeGreaterThanOrEqual(expandedWallLimit + 0.5);
    expect(actual).toBeLessThan(expandedWallLimit + 8.5);

    raceManager.update(1 / 60, NO_INPUT);
    expect(raceManager.getPlayerVehicle().outOfBoundsState).not.toBe('none');
    expect(oobEvents).toHaveLength(1);
    expect(oobEvents[0].reason).toBe('wall-contact');

    raceManager.update(1.0, NO_INPUT);
    expect(raceManager.getPlayerVehicle().outOfBoundsState).not.toBe('none');
    raceManager.update(1.1, NO_INPUT);

    const respawnedPlayer = raceManager.getPlayerVehicle();
    expect(respawnedPlayer.outOfBoundsState).toBe('none');
    expect(respawnEvents).toHaveLength(1);
    expect(respawnedPlayer.position.x).toBeCloseTo(safePose.x, 5);
    expect(respawnedPlayer.position.y).toBeCloseTo(safePose.y, 5);
    expect(respawnedPlayer.position.z).toBeCloseTo(safePose.z, 5);
    expect(respawnedPlayer.yaw).toBeCloseTo(safePose.yaw, 5);
  });
});

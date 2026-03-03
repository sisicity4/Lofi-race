import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { DEFAULT_GAME_CONFIG, DEFAULT_VEHICLE_PARAMS } from '../../src/data/config';
import type { GameEvents } from '../../src/game/GameState';
import { RaceManager } from '../../src/game/RaceManager';
import { createFallbackCoastalTrack } from '../../src/track/TrackLoader';
import type { InputState, LeaderboardEntry, VehicleState } from '../../src/types/game';

const NO_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
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

function alignVehicleOnWaypoint(
  raceManager: RaceManager,
  state: VehicleState,
  waypointIndex: number,
  lateralDistance = 0,
  speedMs = 0,
): void {
  const track = raceManager.trackProgress.getTrack();
  const idx = ((waypointIndex % track.waypoints.length) + track.waypoints.length) % track.waypoints.length;
  const wp = track.waypoints[idx];
  const sample = raceManager.trackProgress.sample({ x: wp.x, z: wp.z });
  const normal = { x: -sample.tangent.z, z: sample.tangent.x };
  state.position.x = sample.nearestPoint.x + normal.x * lateralDistance;
  state.position.z = sample.nearestPoint.z + normal.z * lateralDistance;
  state.yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
  state.velocityWorld.x = Math.sin(state.yaw) * speedMs;
  state.velocityWorld.z = Math.cos(state.yaw) * speedMs;
  state.speedForward = speedMs;
  state.steerVisual = 0;
  state.respawnWaypointIndex = sample.waypointIndex;
}

function placePlayerInRiskState(raceManager: RaceManager, waypointIndex: number): void {
  const player = raceManager.getPlayerVehicle();
  const track = raceManager.trackProgress.getTrack();
  const wp = track.waypoints[waypointIndex % track.waypoints.length];
  const sample = raceManager.trackProgress.sample({ x: wp.x, z: wp.z });
  const wallLimit = sample.width * 0.5 + track.hardBoundaryMargin + 2.5;
  const lateral = Math.max(0, wallLimit - 0.22);
  alignVehicleOnWaypoint(raceManager, player, waypointIndex, lateral, 28);
  player.driftActive = true;
  player.slipRatio = 0.58;
  player.isOffTrack = false;
}

function makeEntry(state: VehicleState, rank: number): LeaderboardEntry {
  return {
    vehicleId: state.id,
    name: state.name,
    rank,
    lap: state.lap,
    progressMetric: state.progressMetric,
    finished: state.finished,
    finishOrder: state.finishOrder,
    isPlayer: state.isPlayer,
  };
}

describe('RaceManager overdrive', () => {
  it('accumulates overdrive meter from sustained risk driving', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    for (let i = 0; i < 170; i += 1) {
      placePlayerInRiskState(raceManager, i);
      raceManager.update(1 / 60, NO_INPUT);
    }

    expect(raceManager.getSnapshot().race.overdriveMeter01).toBeGreaterThan(0.25);
  });

  it('activates overdrive with boost input and applies active multiplier', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    for (let i = 0; i < 220; i += 1) {
      placePlayerInRiskState(raceManager, i);
      raceManager.update(1 / 60, NO_INPUT);
      if (raceManager.getSnapshot().race.overdriveMeter01 >= 0.4) break;
    }

    raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1, boost: true });
    const snapshot = raceManager.getSnapshot();
    expect(snapshot.race.overdriveState).toBe('active');
    expect(snapshot.race.overdriveActiveMs).toBeGreaterThan(0);
    expect(snapshot.race.overdriveMeter01).toBe(0);
    expect(snapshot.race.overdriveSpeedMultiplier).toBeGreaterThan(1);
  });

  it('enters overheated penalty on wall-contact failure while overdrive is active', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    for (let i = 0; i < 220; i += 1) {
      placePlayerInRiskState(raceManager, i);
      raceManager.update(1 / 60, NO_INPUT);
      if (raceManager.getSnapshot().race.overdriveMeter01 >= 0.45) break;
    }

    raceManager.update(1 / 60, { ...NO_INPUT, boost: true, throttle: 1 });
    (raceManager as unknown as { triggerOutOfBounds: (state: VehicleState, reason: 'wall-contact') => void }).triggerOutOfBounds(
      raceManager.getPlayerVehicle(),
      'wall-contact',
    );
    const snapshot = raceManager.getSnapshot();

    expect(snapshot.race.overdriveState).toBe('overheated');
    expect(snapshot.race.overdrivePenaltyMs).toBeGreaterThan(0);
    expect(snapshot.race.overdriveSpeedMultiplier).toBeCloseTo(0.72, 4);
  });

  it('adapts CPU bias toward catch-up equilibrium based on player position trend', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: DEFAULT_GAME_CONFIG,
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    const states = raceManager.getVehicles();
    const player = states.find((v) => v.isPlayer)!;
    const cpus = states.filter((v) => !v.isPlayer);

    player.progressMetric = 128;
    cpus[0].progressMetric = 104;
    cpus[1].progressMetric = 98;
    cpus[2].progressMetric = 94;
    (raceManager as unknown as { leaderboard: LeaderboardEntry[] }).leaderboard = [
      makeEntry(player, 1),
      makeEntry(cpus[0], 2),
      makeEntry(cpus[1], 3),
      makeEntry(cpus[2], 4),
    ];
    (raceManager as unknown as { updateCpuAdaptiveBias: () => void }).updateCpuAdaptiveBias();
    const aheadBias = (raceManager as unknown as { cpuAdaptiveBias: number }).cpuAdaptiveBias;
    expect(aheadBias).toBeGreaterThan(0);

    player.progressMetric = 72;
    cpus[0].progressMetric = 132;
    cpus[1].progressMetric = 126;
    cpus[2].progressMetric = 119;
    (raceManager as unknown as { leaderboard: LeaderboardEntry[] }).leaderboard = [
      makeEntry(cpus[0], 1),
      makeEntry(cpus[1], 2),
      makeEntry(cpus[2], 3),
      makeEntry(player, 4),
    ];
    for (let i = 0; i < 8; i += 1) {
      (raceManager as unknown as { updateCpuAdaptiveBias: () => void }).updateCpuAdaptiveBias();
    }
    const behindBias = (raceManager as unknown as { cpuAdaptiveBias: number }).cpuAdaptiveBias;
    expect(behindBias).toBeLessThan(0);
  });
});

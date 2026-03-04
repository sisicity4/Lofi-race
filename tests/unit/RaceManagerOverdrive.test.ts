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
  boostHeld: false,
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

function setPlayerStraightLineState(raceManager: RaceManager, speedMs = 20): void {
  const player = raceManager.getPlayerVehicle();
  alignVehicleOnWaypoint(raceManager, player, 0, 0, speedMs);
  player.driftActive = false;
  player.slipRatio = 0;
  player.isOffTrack = false;
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
    expect(snapshot.race.overdriveSpeedMultiplier).toBeGreaterThan(1.2);
  });

  it('queues boost while held and auto-activates once meter reaches threshold', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    (raceManager as unknown as { overdriveMeter01: number }).overdriveMeter01 = 0.34;
    raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1, boost: true, boostHeld: true });
    expect(raceManager.getSnapshot().race.overdriveState).toBe('idle');

    for (let i = 0; i < 120; i += 1) {
      placePlayerInRiskState(raceManager, i);
      raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1, boostHeld: true });
      if (raceManager.getSnapshot().race.overdriveState === 'active') break;
    }

    const snapshot = raceManager.getSnapshot();
    expect(snapshot.race.overdriveState).toBe('active');
    expect(snapshot.race.overdriveActiveMs).toBeGreaterThan(0);
  });

  it('accelerates faster during active overdrive than normal driving', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    setPlayerStraightLineState(raceManager, 20);
    raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1 });
    const baseSpeed = raceManager.getPlayerVehicle().speedForward;

    setPlayerStraightLineState(raceManager, 20);
    (raceManager as unknown as { overdriveState: 'active' }).overdriveState = 'active';
    (raceManager as unknown as { overdriveActiveMs: number }).overdriveActiveMs = 1800;
    (raceManager as unknown as { overdriveSpeedMultiplier: number }).overdriveSpeedMultiplier = 1.42;
    (raceManager as unknown as { overdriveAccelMultiplier: number }).overdriveAccelMultiplier = 1.55;
    raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1 });
    const boostedSpeed = raceManager.getPlayerVehicle().speedForward;

    expect(boostedSpeed).toBeGreaterThan(baseSpeed);
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

  it('suppresses acceleration while overheat penalty is active', () => {
    const raceManager = new RaceManager({
      track: createFallbackCoastalTrack(),
      config: { ...DEFAULT_GAME_CONFIG, cpuCount: 0 },
      vehicleParams: DEFAULT_VEHICLE_PARAMS,
      eventBus: new EventBus<GameEvents>(),
      initialBestLapMs: null,
    });
    advanceToRacing(raceManager);

    setPlayerStraightLineState(raceManager, 20);
    raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1 });
    const baseSpeed = raceManager.getPlayerVehicle().speedForward;

    setPlayerStraightLineState(raceManager, 20);
    (raceManager as unknown as { overdriveState: 'overheated' }).overdriveState = 'overheated';
    (raceManager as unknown as { overdrivePenaltyMs: number }).overdrivePenaltyMs = 1800;
    raceManager.update(1 / 60, { ...NO_INPUT, throttle: 1 });
    const penaltySpeed = raceManager.getPlayerVehicle().speedForward;

    expect(penaltySpeed).toBeLessThan(baseSpeed);
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

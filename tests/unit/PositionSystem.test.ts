import { describe, expect, it } from 'vitest';
import { PositionSystem } from '../../src/game/PositionSystem';
import type { VehicleState } from '../../src/types/game';

function vehicle(id: string, progressMetric: number, lap: number, finished = false, finishOrder: number | null = null): VehicleState {
  return {
    id,
    name: id,
    isPlayer: id === 'player',
    colorHex: 0,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    velocityWorld: { x: 0, y: 0, z: 0 },
    speedForward: 0,
    steerVisual: 0,
    slipRatio: 0,
    driftActive: false,
    driftChargeMs: 0,
    driftBoostMs: 0,
    driftBoostStrength: 0,
    isOffTrack: false,
    lap,
    checkpointIndex: 0,
    progress01: 0,
    progressMetric,
    finished,
    finishOrder,
    lapTimesMs: [],
    currentLapMs: 0,
    resetCooldownMs: 0,
    respawnWaypointIndex: 0,
  };
}

describe('PositionSystem', () => {
  it('sorts unfinished cars by progress metric descending', () => {
    const system = new PositionSystem();
    const board = system.computeLeaderboard([vehicle('a', 3.2, 1), vehicle('b', 5.1, 1), vehicle('player', 4.2, 1)]);
    expect(board.map((e) => e.vehicleId)).toEqual(['b', 'player', 'a']);
  });

  it('keeps finished cars ahead using finish order', () => {
    const system = new PositionSystem();
    const board = system.computeLeaderboard([vehicle('a', 10, 3, true, 2), vehicle('b', 100, 3, false), vehicle('player', 10, 3, true, 1)]);
    expect(board.map((e) => e.vehicleId)).toEqual(['player', 'a', 'b']);
  });
});

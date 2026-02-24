import type { Checkpoint, TrackDefinition } from '../types/game';

const CHECKPOINT_RADIUS_MULTIPLIER = 1.9;
const CHECKPOINT_RADIUS_BONUS = 1.8;

const segmentDistanceSq = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): number => {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq <= 1e-9) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
};

interface LapTrackerState {
  nextCheckpointIndex: number;
  insideCheckpoint: boolean[];
  prevX: number;
  prevZ: number;
  hasPrevPosition: boolean;
  lap: number;
  lapTimesMs: number[];
  lapStartMs: number;
  finished: boolean;
  lastPassedCheckpointIndex: number;
}

export interface LapUpdateResult {
  checkpointPassed: number | null;
  lapCompleted: number | null;
  lapTimeMs: number | null;
  finished: boolean;
}

export class LapTracker {
  private readonly checkpoints: Checkpoint[];
  private readonly effectiveCheckpointRadiusSq: number[];
  private readonly states = new Map<string, LapTrackerState>();

  constructor(track: TrackDefinition, private readonly totalLaps: number) {
    this.checkpoints = track.checkpoints;
    this.effectiveCheckpointRadiusSq = track.checkpoints.map((cp) => {
      const effectiveRadius = cp.radius * CHECKPOINT_RADIUS_MULTIPLIER + CHECKPOINT_RADIUS_BONUS;
      return effectiveRadius * effectiveRadius;
    });
  }

  registerVehicle(vehicleId: string, elapsedMs = 0): void {
    this.states.set(vehicleId, {
      nextCheckpointIndex: this.checkpoints.length > 1 ? 1 : 0,
      insideCheckpoint: this.checkpoints.map(() => false),
      prevX: 0,
      prevZ: 0,
      hasPrevPosition: false,
      lap: 0,
      lapTimesMs: [],
      lapStartMs: elapsedMs,
      finished: false,
      lastPassedCheckpointIndex: 0,
    });
  }

  resetAll(elapsedMs = 0): void {
    for (const id of this.states.keys()) {
      this.registerVehicle(id, elapsedMs);
    }
  }

  updateVehicle(vehicleId: string, x: number, z: number, elapsedMs: number): LapUpdateResult {
    const state = this.states.get(vehicleId);
    if (!state) {
      throw new Error(`LapTracker vehicle not registered: ${vehicleId}`);
    }
    if (state.finished) {
      return { checkpointPassed: null, lapCompleted: null, lapTimeMs: null, finished: true };
    }

    let checkpointPassed: number | null = null;
    let lapCompleted: number | null = null;
    let lapTimeMs: number | null = null;

    for (let i = 0; i < this.checkpoints.length; i += 1) {
      const cp = this.checkpoints[i];
      const radiusSq = this.effectiveCheckpointRadiusSq[i];
      const currentInside = (x - cp.x) * (x - cp.x) + (z - cp.z) * (z - cp.z) <= radiusSq;
      const crossedThisStep =
        state.hasPrevPosition &&
        segmentDistanceSq(state.prevX, state.prevZ, x, z, cp.x, cp.z) <= radiusSq;
      const inside = currentInside || crossedThisStep;
      const wasInside = state.insideCheckpoint[i];
      state.insideCheckpoint[i] = inside;

      if (!inside || wasInside) continue;
      if (i !== state.nextCheckpointIndex) continue;

      checkpointPassed = i;
      state.lastPassedCheckpointIndex = i;

      if (i === 0) {
        state.lap += 1;
        lapCompleted = state.lap;
        lapTimeMs = Math.max(0, Math.floor(elapsedMs - state.lapStartMs));
        state.lapTimesMs.push(lapTimeMs);
        state.lapStartMs = elapsedMs;
      }

      state.nextCheckpointIndex = (i + 1) % this.checkpoints.length;

      if (state.lap >= this.totalLaps) {
        state.finished = true;
      }
    }

    state.prevX = x;
    state.prevZ = z;
    state.hasPrevPosition = true;

    return {
      checkpointPassed,
      lapCompleted,
      lapTimeMs,
      finished: state.finished,
    };
  }

  getState(vehicleId: string): Readonly<LapTrackerState> {
    const state = this.states.get(vehicleId);
    if (!state) {
      throw new Error(`LapTracker vehicle not registered: ${vehicleId}`);
    }
    return state;
  }
}

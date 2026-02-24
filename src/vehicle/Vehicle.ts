import { vec3 } from '../core/math';
import type { StartGridSlot, VehicleParams, VehicleState } from '../types/game';

export interface VehicleSpawnOptions {
  id: string;
  name: string;
  isPlayer: boolean;
  colorHex: number;
  spawn: StartGridSlot;
}

export class Vehicle {
  readonly state: VehicleState;

  constructor(public readonly params: VehicleParams, options: VehicleSpawnOptions) {
    this.state = {
      id: options.id,
      name: options.name,
      isPlayer: options.isPlayer,
      colorHex: options.colorHex,
      position: { x: options.spawn.x, y: options.spawn.y, z: options.spawn.z },
      yaw: options.spawn.yaw,
      velocityWorld: vec3(),
      speedForward: 0,
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
    };
  }

  resetToSpawn(spawn: StartGridSlot): void {
    this.state.position.x = spawn.x;
    this.state.position.y = spawn.y;
    this.state.position.z = spawn.z;
    this.state.yaw = spawn.yaw;
    this.state.velocityWorld = vec3();
    this.state.speedForward = 0;
    this.state.steerVisual = 0;
    this.state.slipRatio = 0;
    this.state.driftActive = false;
    this.state.driftChargeMs = 0;
    this.state.driftBoostMs = 0;
    this.state.driftBoostStrength = 0;
    this.state.isOffTrack = false;
    this.state.lap = 0;
    this.state.checkpointIndex = 0;
    this.state.progress01 = 0;
    this.state.progressMetric = 0;
    this.state.finished = false;
    this.state.finishOrder = null;
    this.state.lapTimesMs = [];
    this.state.currentLapMs = 0;
    this.state.resetCooldownMs = 0;
    this.state.respawnWaypointIndex = 0;
  }
}

import type { Vec2XZ, Vec3XYZ } from './common';

export type GraphicsQuality = 'auto' | 'low' | 'standard';
export type LanguageCode = 'ja';
export type SurfaceKind = 'road' | 'grass' | 'sand';
export type RacePhase = 'menu' | 'countdown' | 'racing' | 'finished' | 'paused';
export type UiMessageTone = 'info' | 'hype' | 'warn' | 'result';
export type ComboSource = 'none' | 'drift' | 'straight';
export type OutOfBoundsState = 'none' | 'exploding' | 'respawning';
export type OutOfBoundsReason = 'wall-contact' | 'fell-off';
export type OverdriveState = 'idle' | 'active' | 'overheated';

export interface GameConfig {
  laps: number;
  cpuCount: number;
  fixedStepHz: number;
  graphicsQuality: GraphicsQuality;
  language: LanguageCode;
}

export interface Waypoint {
  x: number;
  z: number;
  targetSpeed: number;
  width: number;
}

export interface Checkpoint {
  x: number;
  z: number;
  radius: number;
}

export interface StartGridSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SurfaceZone {
  kind: SurfaceKind;
  polygon: [number, number][];
}

export type TrackTheme = 'coastal' | 'raceway' | 'desert' | 'forest' | 'studio' | 'sol-abyss';

export interface TrackDefinition {
  id: string;
  theme: TrackTheme;
  startGrid: StartGridSlot[];
  waypoints: Waypoint[];
  checkpoints: Checkpoint[];
  hardBoundaryMargin: number;
  surfaceZones: SurfaceZone[];
}

export interface VehicleParams {
  mass: number;
  accelForward: number;
  brakeForce: number;
  reverseAccel: number;
  maxSpeed: number;
  reverseMaxSpeed: number;
  drag: number;
  lateralGrip: number;
  driftGrip: number;
  steerRate: number;
  steerAtSpeedCurve: number;
  turnRateBase: number;
  offTrackGripMultiplier: number;
  offTrackSpeedMultiplier: number;
  collisionDamping: number;
  radius: number;
}

export interface InputState {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  boost: boolean;
  boostHeld: boolean;
  pause: boolean;
  mute: boolean;
}

export interface VehicleState {
  id: string;
  name: string;
  isPlayer: boolean;
  colorHex: number;
  position: Vec3XYZ;
  yaw: number;
  velocityWorld: Vec3XYZ;
  speedForward: number;
  steerVisual: number;
  slipRatio: number;
  driftActive: boolean;
  driftChargeMs: number;
  driftBoostMs: number;
  driftBoostStrength: number;
  isOffTrack: boolean;
  lap: number;
  checkpointIndex: number;
  progress01: number;
  progressMetric: number;
  finished: boolean;
  finishOrder: number | null;
  lapTimesMs: number[];
  currentLapMs: number;
  resetCooldownMs: number;
  respawnWaypointIndex: number;
  outOfBoundsState: OutOfBoundsState;
  outOfBoundsRespawnMs: number;
  oobCooldownMs: number;
  lastSafePosition: Vec3XYZ;
  lastSafeYaw: number;
  hasLastSafePose: boolean;
  lastSafeRespawnWaypointIndex: number;
}

export interface LeaderboardEntry {
  vehicleId: string;
  name: string;
  rank: number;
  lap: number;
  progressMetric: number;
  finished: boolean;
  finishOrder: number | null;
  isPlayer: boolean;
}

export interface RaceState {
  phase: RacePhase;
  elapsedMs: number;
  leaderboard: LeaderboardEntry[];
  bestLapMs: number | null;
  currentLapMs: number;
  comboLevel: number;
  maxCombo: number;
  comboMeter01: number;
  comboSource: ComboSource;
  comboSpeedMultiplier: number;
  overdriveState: OverdriveState;
  overdriveMeter01: number;
  overdriveActiveMs: number;
  overdrivePenaltyMs: number;
  overdriveSpeedMultiplier: number;
  cpuAdaptiveBias: number;
}

export interface TrackSample {
  nearestSegmentIndex: number;
  segmentT: number;
  progress01: number;
  distance: number;
  nearestPoint: Vec2XZ;
  tangent: Vec2XZ;
  waypointIndex: number;
  width: number;
}

export interface PhysicsEnv {
  dt: number;
  surface: SurfaceKind;
  offTrack: boolean;
  speedMultiplier: number;
  accelMultiplier: number;
}

export interface CountdownSnapshot {
  active: boolean;
  label: string | null;
}

export interface RaceSnapshot {
  race: RaceState;
  vehicles: VehicleState[];
  countdown: CountdownSnapshot;
  message: string | null;
  messageTone: UiMessageTone;
}

export interface SettingsData {
  trackId: string;
  graphicsQuality: GraphicsQuality;
  muted: boolean;
  masterVolume: number;
  invertSteer: boolean;
  bestLapMs: number | null;
}

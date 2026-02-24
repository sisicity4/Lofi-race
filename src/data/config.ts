import type { GameConfig, SettingsData, VehicleParams } from '../types/game';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  laps: 3,
  cpuCount: 3,
  fixedStepHz: 120,
  graphicsQuality: 'auto',
  language: 'ja',
};

export const DEFAULT_SETTINGS: SettingsData = {
  graphicsQuality: 'auto',
  muted: false,
  masterVolume: 0.6,
  bestLapMs: null,
};

export const DEFAULT_VEHICLE_PARAMS: VehicleParams = {
  mass: 1100,
  accelForward: 24,
  brakeForce: 34,
  reverseAccel: 12,
  maxSpeed: 48,
  reverseMaxSpeed: 12,
  drag: 1.65,
  lateralGrip: 10.2,
  driftGrip: 2.8,
  steerRate: 8,
  steerAtSpeedCurve: 0.06,
  turnRateBase: 1.72,
  offTrackGripMultiplier: 0.58,
  offTrackSpeedMultiplier: 0.72,
  collisionDamping: 0.72,
  radius: 1.25,
};

export const PLAYER_COLOR = 0xff375f;
export const CPU_COLORS = [0x3bd7ff, 0xb7ff33, 0xffb703] as const;

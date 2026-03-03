import type { GameConfig, SettingsData, TrackTheme, VehicleParams } from '../types/game';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  laps: 3,
  cpuCount: 3,
  fixedStepHz: 120,
  graphicsQuality: 'auto',
  language: 'ja',
};

export const DEFAULT_SETTINGS: SettingsData = {
  trackId: 'raceway-gp-long-01',
  graphicsQuality: 'auto',
  muted: false,
  masterVolume: 0.6,
  bestLapMs: null,
};

export const DEFAULT_VEHICLE_PARAMS: VehicleParams = {
  mass: 1100,
  accelForward: 29,
  brakeForce: 36,
  reverseAccel: 12,
  maxSpeed: 60,
  reverseMaxSpeed: 12,
  drag: 1.4,
  lateralGrip: 10.2,
  driftGrip: 2.8,
  steerRate: 8,
  steerAtSpeedCurve: 0.06,
  turnRateBase: 1.78,
  offTrackGripMultiplier: 0.58,
  offTrackSpeedMultiplier: 0.75,
  collisionDamping: 0.72,
  radius: 1.25,
};

export const PLAYER_COLOR = 0xff375f;
export const CPU_COLORS = [0x3bd7ff, 0xb7ff33, 0xffb703] as const;

export function getVehicleParamsForTheme(theme: TrackTheme): VehicleParams {
  const params: VehicleParams = { ...DEFAULT_VEHICLE_PARAMS };

  switch (theme) {
    case 'raceway':
      params.maxSpeed *= 1.1;
      params.accelForward *= 1.06;
      params.drag *= 0.95;
      params.lateralGrip *= 1.05;
      break;
    case 'desert':
      params.maxSpeed *= 1.02;
      params.drag *= 1.06;
      params.lateralGrip *= 0.94;
      params.driftGrip *= 0.88;
      params.offTrackGripMultiplier *= 0.82;
      params.offTrackSpeedMultiplier *= 0.84;
      break;
    case 'forest':
      params.maxSpeed *= 0.94;
      params.accelForward *= 0.98;
      params.steerRate *= 1.14;
      params.turnRateBase *= 1.1;
      params.lateralGrip *= 1.08;
      break;
    case 'studio':
      params.maxSpeed *= 1.03;
      params.accelForward *= 1.08;
      params.steerRate *= 1.07;
      params.driftGrip *= 0.92;
      params.turnRateBase *= 1.04;
      break;
    case 'coastal':
    default:
      break;
  }

  return params;
}

import type { GraphicsQuality, RaceSnapshot } from '../types/game';

export interface GameEvents {
  'race:start': { atMs: number };
  'race:countdownTick': { label: string };
  'race:lapComplete': { vehicleId: string; lap: number; lapTimeMs: number };
  'race:finish': { vehicleId: string; finishOrder: number; snapshot: RaceSnapshot };
  'car:collision': { a: string; b: string; impulse: number };
  'car:oob': { vehicleId: string; x: number; y: number; z: number; reason: 'wall-contact' | 'fell-off' };
  'car:respawned': { vehicleId: string; x: number; y: number; z: number };
  'ui:pauseToggled': { paused: boolean };
  'settings:changed': { graphicsQuality: GraphicsQuality; muted: boolean; masterVolume: number };
}

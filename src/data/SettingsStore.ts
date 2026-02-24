import { DEFAULT_SETTINGS } from './config';
import type { SettingsData } from '../types/game';

const STORAGE_KEY = 'webracing.settings.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SettingsStore {
  constructor(private readonly storage?: KeyValueStorage) {}

  load(): SettingsData {
    const storage = this.resolveStorage();
    if (!storage) return { ...DEFAULT_SETTINGS };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<SettingsData>;
      return {
        graphicsQuality: parsed.graphicsQuality ?? DEFAULT_SETTINGS.graphicsQuality,
        muted: parsed.muted ?? DEFAULT_SETTINGS.muted,
        masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : DEFAULT_SETTINGS.masterVolume,
        bestLapMs: typeof parsed.bestLapMs === 'number' ? parsed.bestLapMs : DEFAULT_SETTINGS.bestLapMs,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(settings: SettingsData): void {
    const storage = this.resolveStorage();
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  private resolveStorage(): KeyValueStorage | undefined {
    if (this.storage) return this.storage;
    if (typeof window === 'undefined') return undefined;
    return window.localStorage;
  }
}

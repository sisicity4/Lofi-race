import { describe, expect, it } from 'vitest';
import { SettingsStore, type KeyValueStorage } from '../../src/data/SettingsStore';

class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('SettingsStore', () => {
  it('loads defaults when storage is empty', () => {
    const store = new SettingsStore(new MemoryStorage());
    const settings = store.load();
    expect(settings.graphicsQuality).toBe('auto');
    expect(settings.muted).toBe(false);
  });

  it('saves and loads settings round-trip', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    store.save({ graphicsQuality: 'low', muted: true, masterVolume: 0.25, bestLapMs: 12345 });
    const loaded = store.load();
    expect(loaded).toEqual({ graphicsQuality: 'low', muted: true, masterVolume: 0.25, bestLapMs: 12345 });
  });
});

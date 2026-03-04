import { describe, expect, it } from 'vitest';
import { pickRandomTrackId } from '../../src/track/randomTrack';

describe('pickRandomTrackId', () => {
  it('returns one id from candidates', () => {
    const ids = ['a', 'b', 'c'];
    const picked = pickRandomTrackId(ids, { rng: () => 0.5 });
    expect(ids.includes(picked)).toBe(true);
  });

  it('excludes the requested track when alternatives exist', () => {
    const picked = pickRandomTrackId(['a', 'b', 'c'], { excludeId: 'b', rng: () => 0.5 });
    expect(picked).not.toBe('b');
  });

  it('falls back to the same id when only one track exists', () => {
    const picked = pickRandomTrackId(['solo'], { excludeId: 'solo', rng: () => 0.9 });
    expect(picked).toBe('solo');
  });

  it('is deterministic with injected rng', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(pickRandomTrackId(ids, { rng: () => 0.0 })).toBe('a');
    expect(pickRandomTrackId(ids, { rng: () => 0.26 })).toBe('b');
    expect(pickRandomTrackId(ids, { rng: () => 0.51 })).toBe('c');
    expect(pickRandomTrackId(ids, { rng: () => 0.99 })).toBe('d');
  });
});

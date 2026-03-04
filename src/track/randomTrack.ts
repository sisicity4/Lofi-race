export interface RandomTrackOptions {
  excludeId?: string;
  rng?: () => number;
}

export function pickRandomTrackId(trackIds: readonly string[], options: RandomTrackOptions = {}): string {
  if (trackIds.length === 0) {
    throw new Error('pickRandomTrackId requires at least one track id');
  }

  const filtered = options.excludeId ? trackIds.filter((trackId) => trackId !== options.excludeId) : [...trackIds];
  const candidates = filtered.length > 0 ? filtered : [...trackIds];
  const rng = options.rng ?? Math.random;
  const unit = clamp01(rng());
  const index = Math.min(candidates.length - 1, Math.floor(unit * candidates.length));
  return candidates[index];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 0.999999;
  return value;
}

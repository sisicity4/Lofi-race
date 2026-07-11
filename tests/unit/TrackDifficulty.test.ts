import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TrackLoader } from '../../src/track/TrackLoader';
import { PLAYABLE_TRACK_SPECS, createTrackFromSpec } from '../../src/track/trackBlueprints.js';
import type { TrackDefinition, Waypoint } from '../../src/types/game';

function turnAngleDeg(waypoints: Waypoint[], index: number): number {
  const count = waypoints.length;
  const prev = waypoints[(index - 1 + count) % count];
  const curr = waypoints[index];
  const next = waypoints[(index + 1) % count];
  const ax = curr.x - prev.x;
  const az = curr.z - prev.z;
  const bx = next.x - curr.x;
  const bz = next.z - curr.z;
  const al = Math.hypot(ax, az) || 1;
  const bl = Math.hypot(bx, bz) || 1;
  const dot = (ax / al) * (bx / bl) + (az / al) * (bz / bl);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
}

function trackStats(track: TrackDefinition): {
  mediumTurns: number;
  sharpTurns: number;
  hardTurns: number;
  maxTurnAngle: number;
  minTargetSpeed: number;
  maxWidth: number;
} {
  const angles = track.waypoints.map((_, index) => turnAngleDeg(track.waypoints, index));
  return {
    mediumTurns: angles.filter((angle) => angle >= 24).length,
    sharpTurns: angles.filter((angle) => angle >= 36).length,
    hardTurns: angles.filter((angle) => angle >= 48).length,
    maxTurnAngle: Math.max(...angles),
    minTargetSpeed: Math.min(...track.waypoints.map((waypoint) => waypoint.targetSpeed)),
    maxWidth: Math.max(...track.waypoints.map((waypoint) => waypoint.width)),
  };
}

describe('rebuilt track difficulty spread', () => {
  it('keeps generated JSON in sync with track blueprints', async () => {
    for (const spec of PLAYABLE_TRACK_SPECS) {
      const expected = createTrackFromSpec(spec);
      const path = resolve(process.cwd(), 'public/assets/data', spec.outputFile);
      const actual = JSON.parse(await readFile(path, 'utf8')) as TrackDefinition;
      expect(actual).toEqual(expected);
    }
  });

  it('keeps raceway as the low-sharp-turn stage', async () => {
    const track = await new TrackLoader().loadTrack('raceway-gp-long-01');
    const stats = trackStats(track);

    expect(track.waypoints.length).toBeGreaterThanOrEqual(56);
    expect(track.checkpoints).toHaveLength(8);
    expect(stats.sharpTurns).toBeLessThanOrEqual(2);
    expect(stats.hardTurns).toBe(0);
    expect(stats.maxTurnAngle).toBeLessThanOrEqual(25);
  });

  it('keeps technical stages distinct without 90-degree turn spikes', async () => {
    const loader = new TrackLoader();
    const racewayStats = trackStats(await loader.loadTrack('raceway-gp-long-01'));
    const desertStats = trackStats(await loader.loadTrack('desert-gp-long-01'));
    const forestStats = trackStats(await loader.loadTrack('forest-gp-long-01'));
    const studioStats = trackStats(await loader.loadTrack('studio-gp-long-01'));

    expect(desertStats.mediumTurns).toBeGreaterThanOrEqual(4);
    expect(forestStats.sharpTurns).toBeGreaterThanOrEqual(5);
    expect(studioStats.sharpTurns).toBeGreaterThanOrEqual(2);
    expect(desertStats.maxTurnAngle).toBeLessThanOrEqual(55);
    expect(forestStats.maxTurnAngle).toBeLessThanOrEqual(60);
    expect(studioStats.maxTurnAngle).toBeLessThanOrEqual(65);
    expect(desertStats.mediumTurns).toBeGreaterThan(racewayStats.mediumTurns + 3);
    expect(forestStats.sharpTurns).toBeGreaterThan(racewayStats.sharpTurns + 4);
  });

  it('widens and slows sharp stages enough to keep them learnable', async () => {
    const loader = new TrackLoader();
    const desertStats = trackStats(await loader.loadTrack('desert-gp-long-01'));
    const forestStats = trackStats(await loader.loadTrack('forest-gp-long-01'));
    const studioStats = trackStats(await loader.loadTrack('studio-gp-long-01'));

    expect(desertStats.maxWidth).toBeGreaterThanOrEqual(13);
    expect(forestStats.maxWidth).toBeGreaterThanOrEqual(12.4);
    expect(studioStats.maxWidth).toBeGreaterThanOrEqual(13.6);
    expect(desertStats.minTargetSpeed).toBeGreaterThanOrEqual(22);
    expect(forestStats.minTargetSpeed).toBeGreaterThanOrEqual(22);
    expect(studioStats.minTargetSpeed).toBeGreaterThanOrEqual(22);
  });
});

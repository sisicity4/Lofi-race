import { describe, expect, it } from 'vitest';
import {
  TrackLoader,
  createFallbackDesertTrack,
  createFallbackForestTrack,
  createFallbackRacewayTrack,
  createFallbackStudioTrack,
} from '../../src/track/TrackLoader';

describe('Track direction remap', () => {
  it('reverses desert and keeps the same start point/checkpoint', async () => {
    const loader = new TrackLoader();
    const original = createFallbackDesertTrack();
    const loaded = await loader.loadTrack('desert-gp-long-01');

    expect(loaded.waypoints[0].x).toBeCloseTo(original.waypoints[0].x, 6);
    expect(loaded.waypoints[0].z).toBeCloseTo(original.waypoints[0].z, 6);
    expect(loaded.waypoints[1].x).toBeCloseTo(original.waypoints[original.waypoints.length - 1].x, 6);
    expect(loaded.waypoints[1].z).toBeCloseTo(original.waypoints[original.waypoints.length - 1].z, 6);

    expect(loaded.checkpoints[0].x).toBeCloseTo(original.checkpoints[0].x, 6);
    expect(loaded.checkpoints[0].z).toBeCloseTo(original.checkpoints[0].z, 6);
    expect(loaded.checkpoints[1].x).toBeCloseTo(original.checkpoints[original.checkpoints.length - 1].x, 6);
    expect(loaded.checkpoints[1].z).toBeCloseTo(original.checkpoints[original.checkpoints.length - 1].z, 6);

    const start = loaded.waypoints[0];
    const next = loaded.waypoints[1];
    const expectedYaw = Math.atan2(next.x - start.x, next.z - start.z);
    expect(loaded.startGrid[0].yaw).toBeCloseTo(expectedYaw, 6);
  });

  it('reverses studio and leaves raceway/forest direction unchanged', async () => {
    const loader = new TrackLoader();

    const studioOriginal = createFallbackStudioTrack();
    const studioLoaded = await loader.loadTrack('studio-gp-long-01');
    expect(studioLoaded.waypoints[1].x).toBeCloseTo(studioOriginal.waypoints[studioOriginal.waypoints.length - 1].x, 6);
    expect(studioLoaded.waypoints[1].z).toBeCloseTo(studioOriginal.waypoints[studioOriginal.waypoints.length - 1].z, 6);

    const racewayOriginal = createFallbackRacewayTrack();
    const racewayLoaded = await loader.loadTrack('raceway-gp-long-01');
    expect(racewayLoaded.waypoints[1].x).toBeCloseTo(racewayOriginal.waypoints[1].x, 6);
    expect(racewayLoaded.waypoints[1].z).toBeCloseTo(racewayOriginal.waypoints[1].z, 6);

    const forestOriginal = createFallbackForestTrack();
    const forestLoaded = await loader.loadTrack('forest-gp-long-01');
    expect(forestLoaded.waypoints[1].x).toBeCloseTo(forestOriginal.waypoints[1].x, 6);
    expect(forestLoaded.waypoints[1].z).toBeCloseTo(forestOriginal.waypoints[1].z, 6);
  });
});

import { describe, expect, it } from 'vitest';
import { createFallbackCoastalTrack } from '../../src/track/TrackLoader';
import { TrackProgress } from '../../src/track/TrackProgress';

describe('TrackProgress', () => {
  it('progress generally increases along waypoint order', () => {
    const track = createFallbackCoastalTrack();
    const progress = new TrackProgress(track);

    let prev = -1;
    for (let i = 0; i < track.waypoints.length - 1; i += 1) {
      const wp = track.waypoints[i];
      const sample = progress.sample({ x: wp.x, z: wp.z });
      expect(sample.progress01).toBeGreaterThan(prev);
      prev = sample.progress01;
    }
  });

  it('returns lower progress for an earlier point than a later point on the loop', () => {
    const track = createFallbackCoastalTrack();
    const progress = new TrackProgress(track);
    const a = progress.sample({ x: track.waypoints[3].x, z: track.waypoints[3].z });
    const b = progress.sample({ x: track.waypoints[9].x, z: track.waypoints[9].z });
    expect(a.progress01).toBeLessThan(b.progress01);
  });
});

import { describe, expect, it } from 'vitest';
import { LapTracker } from '../../src/game/LapTracker';
import type { TrackDefinition } from '../../src/types/game';

const track: TrackDefinition = {
  id: 'test',
  theme: 'coastal',
  startGrid: [{ x: 0, y: 0, z: 0, yaw: 0 }],
  waypoints: [
    { x: 0, z: 0, targetSpeed: 20, width: 10 },
    { x: 10, z: 0, targetSpeed: 20, width: 10 },
    { x: 10, z: 10, targetSpeed: 20, width: 10 },
    { x: 0, z: 10, targetSpeed: 20, width: 10 },
  ],
  checkpoints: [
    { x: 0, z: 0, radius: 2 },
    { x: 10, z: 0, radius: 2 },
    { x: 10, z: 10, radius: 2 },
    { x: 0, z: 10, radius: 2 },
  ],
  hardBoundaryMargin: 3,
  surfaceZones: [],
};

describe('LapTracker', () => {
  it('does not complete lap when checkpoints are skipped/out of order', () => {
    const tracker = new LapTracker(track, 1);
    tracker.registerVehicle('player', 0);

    tracker.updateVehicle('player', 0, 0, 100); // start line only
    tracker.updateVehicle('player', 10, 10, 200); // wrong cp (cp2 before cp1)
    const result = tracker.updateVehicle('player', 0, 0, 300); // back to start

    expect(result.lapCompleted).toBeNull();
    expect(tracker.getState('player').lap).toBe(0);
  });

  it('completes lap only after passing checkpoints in order', () => {
    const tracker = new LapTracker(track, 2);
    tracker.registerVehicle('player', 0);

    tracker.updateVehicle('player', 10, 0, 1000);
    tracker.updateVehicle('player', 10, 10, 2000);
    tracker.updateVehicle('player', 0, 10, 3000);
    const lap1 = tracker.updateVehicle('player', 0, 0, 4200);

    expect(lap1.lapCompleted).toBe(1);
    expect(lap1.lapTimeMs).toBe(4200);
    expect(tracker.getState('player').finished).toBe(false);
  });
});

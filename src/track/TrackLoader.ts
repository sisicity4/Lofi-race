import type { TrackDefinition } from '../types/game';

const TRACK_META_URL = '/assets/data/track_coastal.meta.json';

function isTrackDefinition(value: unknown): value is TrackDefinition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<TrackDefinition>;
  return (
    typeof v.id === 'string' &&
    v.theme === 'coastal' &&
    Array.isArray(v.startGrid) &&
    Array.isArray(v.waypoints) &&
    Array.isArray(v.checkpoints) &&
    typeof v.hardBoundaryMargin === 'number' &&
    Array.isArray(v.surfaceZones)
  );
}

export class TrackLoader {
  async loadDefaultTrack(): Promise<TrackDefinition> {
    try {
      const response = await fetch(TRACK_META_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Track meta load failed: ${response.status}`);
      }
      const json = (await response.json()) as unknown;
      if (!isTrackDefinition(json)) {
        throw new Error('Invalid track metadata shape');
      }
      return json;
    } catch {
      return createFallbackCoastalTrack();
    }
  }
}

export function createFallbackCoastalTrack(): TrackDefinition {
  const waypointCount = 28;
  const waypoints = Array.from({ length: waypointCount }, (_, i) => {
    const t = (i / waypointCount) * Math.PI * 2;
    const radiusX = 42 + Math.sin(t * 3 + 0.4) * 9 + Math.sin(t * 7 - 0.9) * 3;
    const radiusZ = 29 + Math.cos(t * 2 - 0.5) * 6 + Math.sin(t * 5 + 0.7) * 2.5;
    const x = Math.cos(t) * radiusX + Math.sin(t * 2.2) * 3.5;
    const z = Math.sin(t) * radiusZ + Math.sin(t * 3.4) * 2.2;
    const curvatureHint = Math.abs(Math.sin(t * 3.1)) + Math.abs(Math.cos(t * 4.7));
    return {
      x: Number(x.toFixed(1)),
      z: Number(z.toFixed(1)),
      targetSpeed: Math.max(18, Math.min(34, Number((20 + (1.8 - curvatureHint / 1.4) * 10).toFixed(1)))),
      width: Number((9.4 + (Math.sin(t * 4) + 1) * 0.7).toFixed(1)),
    };
  });

  const checkpoints = [0, 4, 8, 13, 18, 23].map((idx) => ({
    x: waypoints[idx].x,
    z: waypoints[idx].z,
    radius: 7.5,
  }));
  const start = waypoints[0];
  const next = waypoints[1];
  const dx = next.x - start.x;
  const dz = next.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  const tx = dx / length;
  const tz = dz / length;
  const nx = -tz;
  const nz = tx;
  const yaw = Math.atan2(tx, tz);
  const gridTemplate = [
    { s: 0, side: -2.3 },
    { s: -3.5, side: 2.3 },
    { s: -7.0, side: -2.3 },
    { s: -10.5, side: 2.3 },
  ];
  const startGrid = gridTemplate.map(({ s, side }) => ({
    x: Number((start.x + tx * s + nx * side).toFixed(1)),
    y: 0,
    z: Number((start.z + tz * s + nz * side).toFixed(1)),
    yaw,
  }));

  return {
    id: 'coastal-fallback-gp',
    theme: 'coastal',
    startGrid,
    waypoints,
    checkpoints,
    hardBoundaryMargin: 6.5,
    surfaceZones: [],
  };
}

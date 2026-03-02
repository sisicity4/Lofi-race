import type { Checkpoint, StartGridSlot, TrackDefinition, Waypoint } from '../types/game';

export interface TrackCatalogEntry {
  id: string;
  label: string;
}

interface TrackSource extends TrackCatalogEntry {
  metaPath: string;
  fallback: () => TrackDefinition;
}

const TRACK_SOURCES: readonly TrackSource[] = [
  {
    id: 'coastal-gp-01',
    label: 'Coastal GP',
    metaPath: 'assets/data/track_coastal.meta.json',
    fallback: createFallbackCoastalTrack,
  },
  {
    id: 'harbor-city-gp-01',
    label: 'Harbor City GP',
    metaPath: 'assets/data/track_harbor_city.meta.json',
    fallback: createFallbackHarborTrack,
  },
] as const;

function toMetaUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

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
  getTrackCatalog(): TrackCatalogEntry[] {
    return TRACK_SOURCES.map(({ id, label }) => ({ id, label }));
  }

  resolveTrackId(trackId?: string): string {
    if (trackId && TRACK_SOURCES.some((source) => source.id === trackId)) {
      return trackId;
    }
    return TRACK_SOURCES[0].id;
  }

  async loadDefaultTrack(): Promise<TrackDefinition> {
    return this.loadTrack(TRACK_SOURCES[0].id);
  }

  async loadTrack(trackId: string): Promise<TrackDefinition> {
    const resolvedId = this.resolveTrackId(trackId);
    const source = TRACK_SOURCES.find((entry) => entry.id === resolvedId) ?? TRACK_SOURCES[0];

    try {
      const response = await fetch(toMetaUrl(source.metaPath), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Track meta load failed: ${response.status}`);
      }
      const json = (await response.json()) as unknown;
      if (!isTrackDefinition(json)) {
        throw new Error('Invalid track metadata shape');
      }
      return json;
    } catch {
      return source.fallback();
    }
  }
}

function buildStartGrid(waypoints: Waypoint[]): StartGridSlot[] {
  const start = waypoints[0];
  const next = waypoints[1] ?? waypoints[0];
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

  return gridTemplate.map(({ s, side }) => ({
    x: Number((start.x + tx * s + nx * side).toFixed(1)),
    y: 0,
    z: Number((start.z + tz * s + nz * side).toFixed(1)),
    yaw,
  }));
}

function checkpointsFromIndices(waypoints: Waypoint[], indices: number[], radius: number): Checkpoint[] {
  return indices.map((index) => ({
    x: waypoints[index].x,
    z: waypoints[index].z,
    radius,
  }));
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

  return {
    id: 'coastal-gp-01',
    theme: 'coastal',
    startGrid: buildStartGrid(waypoints),
    waypoints,
    checkpoints: checkpointsFromIndices(waypoints, [0, 4, 8, 13, 18, 23], 7.5),
    hardBoundaryMargin: 6.5,
    surfaceZones: [],
  };
}

export function createFallbackHarborTrack(): TrackDefinition {
  const waypoints: Waypoint[] = [
    { x: 38.0, z: 0.0, targetSpeed: 29.0, width: 10.2 },
    { x: 46.0, z: 8.0, targetSpeed: 28.0, width: 10.4 },
    { x: 48.0, z: 18.0, targetSpeed: 24.0, width: 10.2 },
    { x: 42.0, z: 28.0, targetSpeed: 22.0, width: 9.8 },
    { x: 30.0, z: 34.0, targetSpeed: 25.0, width: 9.6 },
    { x: 16.0, z: 36.0, targetSpeed: 29.0, width: 9.7 },
    { x: 4.0, z: 34.0, targetSpeed: 31.0, width: 9.9 },
    { x: -8.0, z: 30.0, targetSpeed: 27.0, width: 10.1 },
    { x: -18.0, z: 24.0, targetSpeed: 24.0, width: 10.0 },
    { x: -30.0, z: 20.0, targetSpeed: 23.0, width: 9.8 },
    { x: -40.0, z: 18.0, targetSpeed: 26.0, width: 9.7 },
    { x: -48.0, z: 10.0, targetSpeed: 28.0, width: 9.9 },
    { x: -50.0, z: 0.0, targetSpeed: 30.0, width: 10.1 },
    { x: -46.0, z: -10.0, targetSpeed: 27.0, width: 10.0 },
    { x: -36.0, z: -16.0, targetSpeed: 24.0, width: 9.8 },
    { x: -24.0, z: -18.0, targetSpeed: 22.0, width: 9.6 },
    { x: -12.0, z: -16.0, targetSpeed: 26.0, width: 9.7 },
    { x: -4.0, z: -10.0, targetSpeed: 29.0, width: 10.0 },
    { x: 2.0, z: -2.0, targetSpeed: 31.0, width: 10.3 },
    { x: 10.0, z: 4.0, targetSpeed: 30.0, width: 10.2 },
    { x: 18.0, z: 6.0, targetSpeed: 27.0, width: 10.0 },
    { x: 26.0, z: 4.0, targetSpeed: 24.0, width: 9.8 },
    { x: 34.0, z: -2.0, targetSpeed: 23.0, width: 9.7 },
    { x: 40.0, z: -10.0, targetSpeed: 22.0, width: 9.6 },
    { x: 42.0, z: -20.0, targetSpeed: 24.0, width: 9.7 },
    { x: 36.0, z: -30.0, targetSpeed: 23.0, width: 9.6 },
    { x: 24.0, z: -36.0, targetSpeed: 25.0, width: 9.8 },
    { x: 10.0, z: -38.0, targetSpeed: 28.0, width: 10.0 },
    { x: -4.0, z: -36.0, targetSpeed: 31.0, width: 10.2 },
    { x: -18.0, z: -30.0, targetSpeed: 29.0, width: 10.1 },
    { x: -28.0, z: -22.0, targetSpeed: 27.0, width: 9.9 },
    { x: -34.0, z: -12.0, targetSpeed: 26.0, width: 9.8 },
  ];

  return {
    id: 'harbor-city-gp-01',
    theme: 'coastal',
    startGrid: buildStartGrid(waypoints),
    waypoints,
    checkpoints: checkpointsFromIndices(waypoints, [0, 4, 9, 13, 18, 23, 27, 30], 8),
    hardBoundaryMargin: 7,
    surfaceZones: [],
  };
}

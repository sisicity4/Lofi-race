import type { Checkpoint, StartGridSlot, TrackDefinition, TrackTheme, Waypoint } from '../types/game';
export {
  createFallbackCoastalTrack,
  createFallbackDesertTrack,
  createFallbackForestTrack,
  createFallbackRacewayTrack,
  createFallbackStudioTrack,
} from './trackBlueprints.js';
import {
  createFallbackDesertTrack,
  createFallbackForestTrack,
  createFallbackRacewayTrack,
  createFallbackStudioTrack,
} from './trackBlueprints.js';

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
    id: 'raceway-gp-long-01',
    label: 'Grand Raceway / キッチンスピード（直線多め）',
    metaPath: 'assets/data/track_raceway_long.meta.json',
    fallback: createFallbackRacewayTrack,
  },
  {
    id: 'desert-gp-long-01',
    label: 'Desert Canyon / 砂場トイボックス（ドリフト）',
    metaPath: 'assets/data/track_desert_long.meta.json',
    fallback: createFallbackDesertTrack,
  },
  {
    id: 'forest-gp-long-01',
    label: 'Forest Run / デスクジャングル（テクニカル）',
    metaPath: 'assets/data/track_forest_long.meta.json',
    fallback: createFallbackForestTrack,
  },
  {
    id: 'studio-gp-long-01',
    label: 'Studio Backlot / ムービーセット（トリッキー）',
    metaPath: 'assets/data/track_studio_long.meta.json',
    fallback: createFallbackStudioTrack,
  },
] as const;

const SUPPORTED_THEMES: readonly TrackTheme[] = ['coastal', 'raceway', 'desert', 'forest', 'studio'];
const REVERSED_TRACK_IDS = new Set<string>(['desert-gp-long-01', 'studio-gp-long-01']);
const START_CHECKPOINT_ALIGN_MAX_DIST = 2.6;

function toMetaUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function isTrackDefinition(value: unknown): value is TrackDefinition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<TrackDefinition>;
  return (
    typeof v.id === 'string' &&
    typeof v.theme === 'string' &&
    SUPPORTED_THEMES.includes(v.theme as TrackTheme) &&
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
      return applyTrackDirectionFlavor(applyThemeFlavor(json));
    } catch {
      return applyTrackDirectionFlavor(applyThemeFlavor(source.fallback()));
    }
  }
}

function applyThemeFlavor(track: TrackDefinition): TrackDefinition {
  const waypoints = track.waypoints.map((wp, index) => {
    let width = wp.width;
    let targetSpeed = wp.targetSpeed;

    switch (track.theme) {
      case 'raceway':
        width = wp.width * 1.08;
        targetSpeed = wp.targetSpeed * 1.11;
        break;
      case 'desert':
        width = wp.width * 1.02;
        targetSpeed = wp.targetSpeed * (index % 5 === 0 ? 0.95 : 1.02);
        break;
      case 'forest':
        width = wp.width * 0.9;
        targetSpeed = wp.targetSpeed * 0.92;
        break;
      case 'studio': {
        const wave = Math.sin((index / Math.max(1, track.waypoints.length)) * Math.PI * 6);
        width = wp.width * (0.96 + wave * 0.04);
        targetSpeed = wp.targetSpeed * (wave > 0.35 ? 0.88 : 1.05);
        break;
      }
      case 'coastal':
      default:
        break;
    }

    return {
      ...wp,
      width: Number(clamp(width, 8.1, 14.8).toFixed(1)),
      targetSpeed: Number(clamp(targetSpeed, 22, 42).toFixed(1)),
    };
  });

  const checkpointRadiusMultiplier = track.theme === 'forest' ? 1.12 : track.theme === 'desert' ? 1.08 : 1;
  const checkpoints = track.checkpoints.map((cp) => ({
    ...cp,
    radius: Number((cp.radius * checkpointRadiusMultiplier).toFixed(2)),
  }));

  const hardBoundaryMargin =
    track.theme === 'raceway'
      ? track.hardBoundaryMargin + 0.7
      : track.theme === 'desert'
        ? track.hardBoundaryMargin + 0.9
        : track.theme === 'forest'
          ? Math.max(5.2, track.hardBoundaryMargin - 0.8)
          : track.theme === 'studio'
            ? track.hardBoundaryMargin + 0.2
            : track.hardBoundaryMargin;

  return {
    ...track,
    waypoints,
    checkpoints,
    hardBoundaryMargin: Number(hardBoundaryMargin.toFixed(2)),
  };
}

function applyTrackDirectionFlavor(track: TrackDefinition): TrackDefinition {
  if (!REVERSED_TRACK_IDS.has(track.id)) {
    return track;
  }
  return reverseTrackDirectionKeepingStart(track);
}

function reverseTrackDirectionKeepingStart(track: TrackDefinition): TrackDefinition {
  if (track.waypoints.length < 3) return track;
  const reversedWaypoints = reverseWaypointsKeepingFirst(track.waypoints);
  const reversedCheckpoints = reverseCheckpointsKeepingStart(track.checkpoints, track.waypoints, reversedWaypoints);
  return {
    ...track,
    waypoints: reversedWaypoints,
    checkpoints: reversedCheckpoints,
    startGrid: rebuildStartGridFromWaypoints(reversedWaypoints),
  };
}

function reverseWaypointsKeepingFirst(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length <= 1) return waypoints.map((wp) => ({ ...wp }));
  const [first, ...rest] = waypoints;
  return [{ ...first }, ...rest.slice().reverse().map((wp) => ({ ...wp }))];
}

function reverseCheckpointsKeepingStart(
  checkpoints: Checkpoint[],
  originalWaypoints: Waypoint[],
  reversedWaypoints: Waypoint[],
): Checkpoint[] {
  if (checkpoints.length <= 1) return checkpoints.map((cp) => ({ ...cp }));
  const startCheckpoint = checkpoints[0];
  const startWaypoint = originalWaypoints[0];
  if (!startWaypoint || !isStartCheckpointAligned(startCheckpoint, startWaypoint)) {
    return rebuildCheckpointsFromWaypoints(reversedWaypoints, checkpoints.length, checkpoints);
  }

  const [first, ...rest] = checkpoints;
  return [{ ...first }, ...rest.slice().reverse().map((cp) => ({ ...cp }))];
}

function isStartCheckpointAligned(checkpoint: Checkpoint, waypoint: Waypoint): boolean {
  const dx = checkpoint.x - waypoint.x;
  const dz = checkpoint.z - waypoint.z;
  return Math.hypot(dx, dz) <= START_CHECKPOINT_ALIGN_MAX_DIST;
}

function rebuildCheckpointsFromWaypoints(
  waypoints: Waypoint[],
  checkpointCount: number,
  sourceCheckpoints: Checkpoint[],
): Checkpoint[] {
  if (waypoints.length === 0 || checkpointCount <= 0) return [];
  const step = Math.max(1, Math.floor(waypoints.length / checkpointCount));
  const fallbackRadius = sourceCheckpoints[0]?.radius ?? 8;
  return Array.from({ length: checkpointCount }, (_, idx) => {
    const wp = waypoints[(idx * step) % waypoints.length];
    const radius = sourceCheckpoints[idx]?.radius ?? fallbackRadius;
    return {
      x: wp.x,
      z: wp.z,
      radius,
    };
  });
}

function rebuildStartGridFromWaypoints(waypoints: Waypoint[]): StartGridSlot[] {
  return buildStartGrid(waypoints);
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
    { s: 0, side: -2.4 },
    { s: -3.8, side: 2.4 },
    { s: -7.6, side: -2.4 },
    { s: -11.4, side: 2.4 },
  ];

  return gridTemplate.map(({ s, side }) => ({
    x: Number((start.x + tx * s + nx * side).toFixed(1)),
    y: 0,
    z: Number((start.z + tz * s + nz * side).toFixed(1)),
    yaw,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

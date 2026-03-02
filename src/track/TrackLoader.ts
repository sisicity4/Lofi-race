import type { Checkpoint, StartGridSlot, TrackDefinition, TrackTheme, Waypoint } from '../types/game';

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
    label: 'Grand Raceway / 高速',
    metaPath: 'assets/data/track_raceway_long.meta.json',
    fallback: createFallbackRacewayTrack,
  },
  {
    id: 'desert-gp-long-01',
    label: 'Desert Canyon / ドリフト (CCW)',
    metaPath: 'assets/data/track_desert_long.meta.json',
    fallback: createFallbackDesertTrack,
  },
  {
    id: 'forest-gp-long-01',
    label: 'Forest Run / テクニカル',
    metaPath: 'assets/data/track_forest_long.meta.json',
    fallback: createFallbackForestTrack,
  },
  {
    id: 'studio-gp-long-01',
    label: 'Studio Backlot / トリッキー (CCW)',
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
      targetSpeed: Number(clamp(targetSpeed, 18, 42).toFixed(1)),
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

interface ProceduralTrackConfig {
  id: string;
  theme: TrackTheme;
  count: number;
  radiusX: number;
  radiusZ: number;
  wave1: { freq: number; amp: number; phase: number };
  wave2: { freq: number; amp: number; phase: number };
  wave3: { freq: number; amp: number; phase: number };
  wave4: { freq: number; amp: number; phase: number };
  widthBase: number;
  widthWaveAmp: number;
  widthWaveFreq: number;
  speedBase: number;
  speedAmp: number;
  speedCurveA: number;
  speedCurveB: number;
  checkpointCount: number;
  checkpointRadius: number;
  hardBoundaryMargin: number;
}

function createProceduralLongTrack(config: ProceduralTrackConfig): TrackDefinition {
  const waypoints: Waypoint[] = [];
  for (let i = 0; i < config.count; i += 1) {
    const t = (i / config.count) * Math.PI * 2;
    const x =
      Math.cos(t) * config.radiusX +
      Math.sin(t * config.wave1.freq + config.wave1.phase) * config.wave1.amp +
      Math.cos(t * config.wave2.freq + config.wave2.phase) * config.wave2.amp;
    const z =
      Math.sin(t) * config.radiusZ +
      Math.cos(t * config.wave3.freq + config.wave3.phase) * config.wave3.amp +
      Math.sin(t * config.wave4.freq + config.wave4.phase) * config.wave4.amp;

    const curvatureHint =
      Math.abs(Math.sin(t * config.speedCurveA + config.wave1.phase)) * 0.72 +
      Math.abs(Math.cos(t * config.speedCurveB + config.wave2.phase)) * 0.58;

    const targetSpeed = clamp(config.speedBase + (1.42 - curvatureHint) * config.speedAmp, 20, 39);
    const width = config.widthBase + (Math.sin(t * config.widthWaveFreq + config.wave3.phase) + 1) * config.widthWaveAmp;

    waypoints.push({
      x: Number(x.toFixed(1)),
      z: Number(z.toFixed(1)),
      targetSpeed: Number(targetSpeed.toFixed(1)),
      width: Number(width.toFixed(1)),
    });
  }

  const startGrid = buildStartGrid(waypoints);
  const step = Math.max(1, Math.floor(waypoints.length / config.checkpointCount));
  const checkpointIndices = Array.from({ length: config.checkpointCount }, (_, idx) => (idx * step) % waypoints.length);

  return {
    id: config.id,
    theme: config.theme,
    startGrid,
    waypoints,
    checkpoints: checkpointsFromIndices(waypoints, checkpointIndices, config.checkpointRadius),
    hardBoundaryMargin: config.hardBoundaryMargin,
    surfaceZones: [],
  };
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

function checkpointsFromIndices(waypoints: Waypoint[], indices: number[], radius: number): Checkpoint[] {
  return indices.map((index) => ({
    x: waypoints[index].x,
    z: waypoints[index].z,
    radius,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createFallbackRacewayTrack(): TrackDefinition {
  return createProceduralLongTrack({
    id: 'raceway-gp-long-01',
    theme: 'raceway',
    count: 48,
    radiusX: 96,
    radiusZ: 58,
    wave1: { freq: 2.8, amp: 10, phase: 0.2 },
    wave2: { freq: 5.3, amp: 4, phase: -0.7 },
    wave3: { freq: 3.1, amp: 9, phase: 0.4 },
    wave4: { freq: 6.4, amp: 3, phase: 0.9 },
    widthBase: 10.4,
    widthWaveAmp: 0.8,
    widthWaveFreq: 3.8,
    speedBase: 27,
    speedAmp: 8,
    speedCurveA: 3.0,
    speedCurveB: 5.4,
    checkpointCount: 8,
    checkpointRadius: 8.6,
    hardBoundaryMargin: 7.4,
  });
}

export function createFallbackDesertTrack(): TrackDefinition {
  return createProceduralLongTrack({
    id: 'desert-gp-long-01',
    theme: 'desert',
    count: 52,
    radiusX: 104,
    radiusZ: 64,
    wave1: { freq: 2.3, amp: 14, phase: 1.2 },
    wave2: { freq: 4.8, amp: 6, phase: 0.4 },
    wave3: { freq: 2.7, amp: 11, phase: -0.8 },
    wave4: { freq: 5.9, amp: 4, phase: 0.1 },
    widthBase: 10.8,
    widthWaveAmp: 0.9,
    widthWaveFreq: 3.4,
    speedBase: 26,
    speedAmp: 8.6,
    speedCurveA: 2.7,
    speedCurveB: 5.0,
    checkpointCount: 8,
    checkpointRadius: 9.2,
    hardBoundaryMargin: 7.8,
  });
}

export function createFallbackForestTrack(): TrackDefinition {
  return createProceduralLongTrack({
    id: 'forest-gp-long-01',
    theme: 'forest',
    count: 50,
    radiusX: 92,
    radiusZ: 68,
    wave1: { freq: 3.4, amp: 12, phase: -0.1 },
    wave2: { freq: 6.2, amp: 4, phase: 0.9 },
    wave3: { freq: 3.0, amp: 10, phase: 0.5 },
    wave4: { freq: 5.5, amp: 5, phase: -0.3 },
    widthBase: 10.2,
    widthWaveAmp: 0.8,
    widthWaveFreq: 4.1,
    speedBase: 26.5,
    speedAmp: 8.2,
    speedCurveA: 3.2,
    speedCurveB: 5.9,
    checkpointCount: 8,
    checkpointRadius: 8.8,
    hardBoundaryMargin: 7.5,
  });
}

export function createFallbackStudioTrack(): TrackDefinition {
  return createProceduralLongTrack({
    id: 'studio-gp-long-01',
    theme: 'studio',
    count: 46,
    radiusX: 88,
    radiusZ: 56,
    wave1: { freq: 2.0, amp: 9, phase: 0.6 },
    wave2: { freq: 4.0, amp: 5, phase: -0.4 },
    wave3: { freq: 2.2, amp: 8, phase: 0.2 },
    wave4: { freq: 4.6, amp: 4, phase: 1.1 },
    widthBase: 10.0,
    widthWaveAmp: 0.75,
    widthWaveFreq: 3.2,
    speedBase: 27.2,
    speedAmp: 7.8,
    speedCurveA: 2.9,
    speedCurveB: 4.6,
    checkpointCount: 8,
    checkpointRadius: 8.4,
    hardBoundaryMargin: 7.2,
  });
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
    id: 'coastal-fallback-gp',
    theme: 'coastal',
    startGrid: buildStartGrid(waypoints),
    waypoints,
    checkpoints: checkpointsFromIndices(waypoints, [0, 4, 8, 13, 18, 23], 7.5),
    hardBoundaryMargin: 6.5,
    surfaceZones: [],
  };
}

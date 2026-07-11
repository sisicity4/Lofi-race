const ROUND = 10;

export const PLAYABLE_TRACK_SPECS = [
  {
    id: 'raceway-gp-long-01',
    theme: 'raceway',
    outputFile: 'track_raceway_long.meta.json',
    controlPoints: [
      [96, 0],
      [118, 18],
      [110, 42],
      [72, 58],
      [18, 62],
      [-42, 55],
      [-92, 34],
      [-112, 4],
      [-96, -28],
      [-46, -48],
      [14, -54],
      [72, -38],
    ],
    samplesPerSegment: 5,
    widthBase: 12.5,
    widthCornerBoost: 2.0,
    widthWave: 0.45,
    speedBase: 35.5,
    speedCornerDrop: 10.5,
    checkpointCount: 8,
    checkpointRadius: 8.6,
    hardBoundaryMargin: 7.5,
  },
  {
    id: 'desert-gp-long-01',
    theme: 'desert',
    outputFile: 'track_desert_long.meta.json',
    controlPoints: [
      [110, 2],
      [109, 30],
      [100, 52],
      [78, 64],
      [44, 66],
      [12, 54],
      [-10, 68],
      [-36, 50],
      [-72, 34],
      [-98, 6],
      [-92, -24],
      [-62, -48],
      [-22, -50],
      [18, -64],
      [46, -38],
      [72, -52],
      [98, -18],
    ],
    samplesPerSegment: 4,
    widthBase: 11.7,
    widthCornerBoost: 2.2,
    widthWave: 0.55,
    speedBase: 33.2,
    speedCornerDrop: 10.8,
    checkpointCount: 9,
    checkpointRadius: 9.4,
    hardBoundaryMargin: 8.0,
  },
  {
    id: 'forest-gp-long-01',
    theme: 'forest',
    outputFile: 'track_forest_long.meta.json',
    controlPoints: [
      [86, 8],
      [92, 34],
      [84, 56],
      [62, 68],
      [40, 62],
      [18, 72],
      [-14, 58],
      [-34, 30],
      [-74, 24],
      [-88, -6],
      [-68, -30],
      [-78, -58],
      [-30, -62],
      [0, -42],
      [32, -60],
      [66, -34],
      [90, -18],
    ],
    samplesPerSegment: 4,
    widthBase: 11.1,
    widthCornerBoost: 2.3,
    widthWave: 0.5,
    speedBase: 32.8,
    speedCornerDrop: 10.4,
    checkpointCount: 9,
    checkpointRadius: 8.8,
    hardBoundaryMargin: 7.2,
  },
  {
    id: 'studio-gp-long-01',
    theme: 'studio',
    outputFile: 'track_studio_long.meta.json',
    controlPoints: [
      [92, 8],
      [92, 34],
      [82, 56],
      [58, 66],
      [26, 46],
      [-2, 70],
      [-42, 48],
      [-74, 18],
      [-96, -8],
      [-80, -38],
      [-46, -58],
      [-8, -56],
      [26, -70],
      [56, -46],
      [86, -28],
    ],
    samplesPerSegment: 4,
    widthBase: 11.2,
    widthCornerBoost: 2.5,
    widthWave: 0.62,
    speedBase: 33.0,
    speedCornerDrop: 10.8,
    checkpointCount: 9,
    checkpointRadius: 8.7,
    hardBoundaryMargin: 7.5,
  },
];

export function createTrackFromSpec(spec) {
  const waypoints = buildWaypoints(spec);
  return {
    id: spec.id,
    theme: spec.theme,
    startGrid: buildStartGrid(waypoints),
    waypoints,
    checkpoints: checkpointsFromWaypoints(waypoints, spec.checkpointCount, spec.checkpointRadius),
    hardBoundaryMargin: spec.hardBoundaryMargin,
    surfaceZones: [],
  };
}

export function createPlayableTrackById(id) {
  const spec = PLAYABLE_TRACK_SPECS.find((entry) => entry.id === id);
  if (!spec) {
    throw new Error(`Unknown playable track id: ${id}`);
  }
  return createTrackFromSpec(spec);
}

export function createFallbackRacewayTrack() {
  return createPlayableTrackById('raceway-gp-long-01');
}

export function createFallbackDesertTrack() {
  return createPlayableTrackById('desert-gp-long-01');
}

export function createFallbackForestTrack() {
  return createPlayableTrackById('forest-gp-long-01');
}

export function createFallbackStudioTrack() {
  return createPlayableTrackById('studio-gp-long-01');
}

export function createFallbackCoastalTrack() {
  const waypointCount = 28;
  const waypoints = Array.from({ length: waypointCount }, (_, i) => {
    const t = (i / waypointCount) * Math.PI * 2;
    const radiusX = 42 + Math.sin(t * 3 + 0.4) * 9 + Math.sin(t * 7 - 0.9) * 3;
    const radiusZ = 29 + Math.cos(t * 2 - 0.5) * 6 + Math.sin(t * 5 + 0.7) * 2.5;
    const x = Math.cos(t) * radiusX + Math.sin(t * 2.2) * 3.5;
    const z = Math.sin(t) * radiusZ + Math.sin(t * 3.4) * 2.2;
    const curvatureHint = Math.abs(Math.sin(t * 3.1)) + Math.abs(Math.cos(t * 4.7));
    return {
      x: round(x),
      z: round(z),
      targetSpeed: round(clamp(20 + (1.8 - curvatureHint / 1.4) * 10, 18, 34)),
      width: round(9.4 + (Math.sin(t * 4) + 1) * 0.7),
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

function buildWaypoints(spec) {
  const sampled = [];
  const count = spec.controlPoints.length;

  for (let i = 0; i < count; i += 1) {
    const p0 = spec.controlPoints[(i - 1 + count) % count];
    const p1 = spec.controlPoints[i];
    const p2 = spec.controlPoints[(i + 1) % count];
    const p3 = spec.controlPoints[(i + 2) % count];

    for (let step = 0; step < spec.samplesPerSegment; step += 1) {
      const t = step / spec.samplesPerSegment;
      sampled.push(catmullRom(p0, p1, p2, p3, t));
    }
  }

  return sampled.map(([x, z], index) => {
    const turn = turnSeverity(sampled, index);
    const flowWave = Math.sin((index / sampled.length) * Math.PI * 2 * 3 + spec.widthBase);
    return {
      x: round(x),
      z: round(z),
      targetSpeed: round(clamp(spec.speedBase - turn * spec.speedCornerDrop + Math.max(0, flowWave) * 1.4, 22, 40)),
      width: round(clamp(spec.widthBase + turn * spec.widthCornerBoost + flowWave * spec.widthWave, 8.8, 14.7)),
    };
  });
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function turnSeverity(points, index) {
  const count = points.length;
  const prev = points[(index - 2 + count) % count];
  const curr = points[index];
  const next = points[(index + 2) % count];
  const a = normalize([curr[0] - prev[0], curr[1] - prev[1]]);
  const b = normalize([next[0] - curr[0], next[1] - curr[1]]);
  const dot = clamp(a[0] * b[0] + a[1] * b[1], -1, 1);
  const angle = Math.acos(dot);
  return clamp(angle / 1.08, 0, 1);
}

function buildStartGrid(waypoints) {
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

  return [
    { s: 0, side: -2.4 },
    { s: -3.8, side: 2.4 },
    { s: -7.6, side: -2.4 },
    { s: -11.4, side: 2.4 },
  ].map(({ s, side }) => ({
    x: round(start.x + tx * s + nx * side),
    y: 0,
    z: round(start.z + tz * s + nz * side),
    yaw,
  }));
}

function checkpointsFromWaypoints(waypoints, checkpointCount, radius) {
  const step = Math.max(1, Math.floor(waypoints.length / checkpointCount));
  const indices = Array.from({ length: checkpointCount }, (_, idx) => (idx * step) % waypoints.length);
  return checkpointsFromIndices(waypoints, indices, radius);
}

function checkpointsFromIndices(waypoints, indices, radius) {
  return indices.map((index) => ({
    x: waypoints[index].x,
    z: waypoints[index].z,
    radius,
  }));
}

function normalize(value) {
  const length = Math.hypot(value[0], value[1]) || 1;
  return [value[0] / length, value[1] / length];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  const rounded = Math.round(value * ROUND) / ROUND;
  return Object.is(rounded, -0) ? 0 : rounded;
}

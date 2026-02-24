import type { Vec2XZ, Vec3XYZ } from '../types/common';

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothDamp = (current: number, target: number, smoothFactor: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-smoothFactor * dt));
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const vec2 = (x = 0, z = 0): Vec2XZ => ({ x, z });
export const vec3 = (x = 0, y = 0, z = 0): Vec3XYZ => ({ x, y, z });

export const add2 = (a: Vec2XZ, b: Vec2XZ): Vec2XZ => ({ x: a.x + b.x, z: a.z + b.z });
export const sub2 = (a: Vec2XZ, b: Vec2XZ): Vec2XZ => ({ x: a.x - b.x, z: a.z - b.z });
export const scale2 = (a: Vec2XZ, s: number): Vec2XZ => ({ x: a.x * s, z: a.z * s });
export const dot2 = (a: Vec2XZ, b: Vec2XZ): number => a.x * b.x + a.z * b.z;
export const lenSq2 = (a: Vec2XZ): number => dot2(a, a);
export const len2 = (a: Vec2XZ): number => Math.sqrt(lenSq2(a));
export const normalize2 = (a: Vec2XZ): Vec2XZ => {
  const l = len2(a);
  if (l <= 1e-6) return { x: 0, z: 0 };
  return { x: a.x / l, z: a.z / l };
};
export const perpLeft2 = (a: Vec2XZ): Vec2XZ => ({ x: -a.z, z: a.x });
export const angleWrap = (radians: number): number => {
  let a = radians;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const projectPointToSegment2 = (p: Vec2XZ, a: Vec2XZ, b: Vec2XZ): { t: number; point: Vec2XZ; distance: number } => {
  const ab = sub2(b, a);
  const abLenSq = lenSq2(ab);
  if (abLenSq <= 1e-6) {
    const d = len2(sub2(p, a));
    return { t: 0, point: { ...a }, distance: d };
  }
  const t = clamp(dot2(sub2(p, a), ab) / abLenSq, 0, 1);
  const point = add2(a, scale2(ab, t));
  const distance = len2(sub2(p, point));
  return { t, point, distance };
};

export const formatMs = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const centis = Math.floor((total % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
};

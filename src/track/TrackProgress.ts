import { add2, len2, normalize2, projectPointToSegment2, scale2, sub2 } from '../core/math';
import type { Vec2XZ } from '../types/common';
import type { TrackDefinition, TrackSample } from '../types/game';

export interface RespawnTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class TrackProgress {
  private readonly points: Vec2XZ[];
  private readonly cumulativeLengths: number[];
  private readonly totalLength: number;

  constructor(private readonly track: TrackDefinition) {
    this.points = track.waypoints.map((wp) => ({ x: wp.x, z: wp.z }));
    const cumulative = [0];
    let total = 0;
    for (let i = 0; i < this.points.length; i += 1) {
      const a = this.points[i];
      const b = this.points[(i + 1) % this.points.length];
      total += len2(sub2(b, a));
      cumulative.push(total);
    }
    this.cumulativeLengths = cumulative;
    this.totalLength = total || 1;
  }

  getTrack(): TrackDefinition {
    return this.track;
  }

  waypointCount(): number {
    return this.points.length;
  }

  sample(position: Vec2XZ): TrackSample {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestSegment = 0;
    let bestT = 0;
    let bestPoint = this.points[0];

    for (let i = 0; i < this.points.length; i += 1) {
      const a = this.points[i];
      const b = this.points[(i + 1) % this.points.length];
      const projected = projectPointToSegment2(position, a, b);
      if (projected.distance < bestDistance) {
        bestDistance = projected.distance;
        bestSegment = i;
        bestT = projected.t;
        bestPoint = projected.point;
      }
    }

    const segmentStart = this.points[bestSegment];
    const segmentEnd = this.points[(bestSegment + 1) % this.points.length];
    const tangent = normalize2(sub2(segmentEnd, segmentStart));
    const segmentLength = len2(sub2(segmentEnd, segmentStart));
    const alongTrackLength = this.cumulativeLengths[bestSegment] + bestT * segmentLength;
    const widthA = this.track.waypoints[bestSegment].width;
    const widthB = this.track.waypoints[(bestSegment + 1) % this.points.length].width;
    const width = widthA + (widthB - widthA) * bestT;

    return {
      nearestSegmentIndex: bestSegment,
      segmentT: bestT,
      progress01: alongTrackLength / this.totalLength,
      distance: bestDistance,
      nearestPoint: bestPoint,
      tangent,
      waypointIndex: bestSegment,
      width,
    };
  }

  getWaypoint(index: number): Vec2XZ {
    const i = ((index % this.points.length) + this.points.length) % this.points.length;
    return this.points[i];
  }

  getWaypointTangent(index: number): Vec2XZ {
    const a = this.getWaypoint(index);
    const b = this.getWaypoint(index + 1);
    return normalize2(sub2(b, a));
  }

  findClosestWaypointIndex(position: Vec2XZ): number {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.points.length; i += 1) {
      const d = len2(sub2(position, this.points[i]));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  getRespawnTransform(waypointIndex: number): RespawnTransform {
    const point = this.getWaypoint(waypointIndex);
    const tangent = this.getWaypointTangent(waypointIndex);
    const yaw = Math.atan2(tangent.x, tangent.z);
    return { x: point.x, y: 0, z: point.z, yaw };
  }

  nearestPointInsideTrack(position: Vec2XZ, sample: TrackSample): Vec2XZ {
    const halfWidth = sample.width * 0.5;
    const margin = this.track.hardBoundaryMargin;
    const allowed = halfWidth + margin;
    if (sample.distance <= allowed) {
      return { ...position };
    }
    const tangent = sample.tangent;
    const toPosition = sub2(position, sample.nearestPoint);
    const tangentProjection = tangent.x * toPosition.x + tangent.z * toPosition.z;
    const tangentComponent = scale2(tangent, tangentProjection);
    const lateral = sub2(toPosition, tangentComponent);
    const lateralLen = len2(lateral);
    if (lateralLen <= 1e-6) return { ...sample.nearestPoint };
    const clampedLateral = scale2(lateral, allowed / lateralLen);
    return add2(sample.nearestPoint, add2(tangentComponent, clampedLateral));
  }
}

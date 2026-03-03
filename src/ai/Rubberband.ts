import { clamp } from '../core/math';

export class Rubberband {
  getMultiplier(rank: number, total: number, adaptiveBias = 0): number {
    if (total <= 1) return 1;
    const normalized = (rank - 1) / (total - 1);
    return clamp(1.16 - normalized * 0.14 + adaptiveBias, 0.92, 1.24);
  }
}

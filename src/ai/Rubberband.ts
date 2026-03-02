import { clamp } from '../core/math';

export class Rubberband {
  getMultiplier(rank: number, total: number): number {
    if (total <= 1) return 1;
    const normalized = (rank - 1) / (total - 1);
    return clamp(1.16 - normalized * 0.14, 0.99, 1.16);
  }
}

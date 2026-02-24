import { clamp } from '../core/math';

export class Rubberband {
  getMultiplier(rank: number, total: number): number {
    if (total <= 1) return 1;
    const normalized = (rank - 1) / (total - 1);
    return clamp(1.1 - normalized * 0.18, 0.94, 1.1);
  }
}

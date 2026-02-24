import type { LeaderboardEntry, VehicleState } from '../types/game';

export class PositionSystem {
  computeLeaderboard(vehicles: VehicleState[]): LeaderboardEntry[] {
    const sorted = [...vehicles].sort((a, b) => {
      if (a.finished && b.finished) {
        return (a.finishOrder ?? Number.MAX_SAFE_INTEGER) - (b.finishOrder ?? Number.MAX_SAFE_INTEGER);
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progressMetric - a.progressMetric;
    });

    return sorted.map((vehicle, index) => ({
      vehicleId: vehicle.id,
      name: vehicle.name,
      rank: index + 1,
      lap: vehicle.lap,
      progressMetric: vehicle.progressMetric,
      finished: vehicle.finished,
      finishOrder: vehicle.finishOrder,
      isPlayer: vehicle.isPlayer,
    }));
  }
}

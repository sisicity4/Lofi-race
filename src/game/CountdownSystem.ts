import type { CountdownSnapshot } from '../types/game';

const LABELS = ['3', '2', '1', 'GO'];

export interface CountdownUpdateResult {
  changedLabel: string | null;
  startRaceNow: boolean;
}

export class CountdownSystem {
  private active = false;
  private elapsedMs = 0;
  private currentLabelIndex = -1;
  private raceStarted = false;

  start(): void {
    this.active = true;
    this.elapsedMs = 0;
    this.currentLabelIndex = -1;
    this.raceStarted = false;
  }

  stop(): void {
    this.active = false;
    this.elapsedMs = 0;
    this.currentLabelIndex = -1;
    this.raceStarted = false;
  }

  update(dtSec: number): CountdownUpdateResult {
    if (!this.active) {
      return { changedLabel: null, startRaceNow: false };
    }

    this.elapsedMs += dtSec * 1000;

    const nextIndex = Math.min(Math.floor(this.elapsedMs / 1000), LABELS.length - 1);
    let changedLabel: string | null = null;
    if (nextIndex !== this.currentLabelIndex) {
      this.currentLabelIndex = nextIndex;
      changedLabel = LABELS[nextIndex];
    }

    let startRaceNow = false;
    if (!this.raceStarted && this.elapsedMs >= 3000) {
      this.raceStarted = true;
      startRaceNow = true;
    }

    if (this.elapsedMs >= 4000) {
      this.active = false;
    }

    return { changedLabel, startRaceNow };
  }

  snapshot(): CountdownSnapshot {
    if (!this.active || this.currentLabelIndex < 0) {
      return { active: false, label: null };
    }
    return { active: true, label: LABELS[this.currentLabelIndex] };
  }
}

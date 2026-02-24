import { FixedStep } from './FixedStep';

export interface GameLoopHooks {
  fixedUpdate: (dtSec: number) => void;
  render: (alpha: number, frameDeltaSec: number) => void;
}

export class GameLoop {
  private rafId: number | null = null;
  private lastTime = 0;
  private readonly fixedStep: FixedStep;
  private readonly hooks: GameLoopHooks;
  private paused = false;

  constructor(stepHz: number, hooks: GameLoopHooks) {
    this.fixedStep = new FixedStep(stepHz);
    this.hooks = hooks;
    this.onFrame = this.onFrame.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.rafId = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.fixedStep.reset();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.fixedStep.reset();
    }
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.fixedStep.reset();
    }
    this.lastTime = performance.now();
  }

  private onFrame(now: number): void {
    const deltaSec = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    let alpha = 0;
    if (!this.paused) {
      alpha = this.fixedStep.tick(deltaSec, this.hooks.fixedUpdate);
    }
    this.hooks.render(alpha, deltaSec);
    this.rafId = requestAnimationFrame(this.onFrame);
  }
}

export class FixedStep {
  private accumulator = 0;
  private readonly stepSec: number;
  private readonly maxStepsPerFrame: number;

  constructor(stepHz: number, maxStepsPerFrame = 8) {
    this.stepSec = 1 / stepHz;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  reset(): void {
    this.accumulator = 0;
  }

  tick(deltaSec: number, update: (dtSec: number) => void): number {
    this.accumulator += deltaSec;
    let steps = 0;
    while (this.accumulator >= this.stepSec && steps < this.maxStepsPerFrame) {
      update(this.stepSec);
      this.accumulator -= this.stepSec;
      steps += 1;
    }
    if (steps >= this.maxStepsPerFrame) {
      this.accumulator = 0;
    }
    return this.accumulator / this.stepSec;
  }
}

import { clamp } from '../core/math';

export interface AudioStateSnapshot {
  muted: boolean;
  masterVolume: number;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private skidNoiseSource: AudioBufferSourceNode | null = null;
  private muted = false;
  private masterVolume = 0.6;
  private initialized = false;

  constructor(initial: AudioStateSnapshot) {
    this.muted = initial.muted;
    this.masterVolume = clamp(initial.masterVolume, 0, 1);
  }

  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
    this.updateMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMasterGain();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    this.updateMasterGain();
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  updateDrivingAudio(speed: number, slip: number, active: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.skidGain) return;
    const now = this.ctx.currentTime;
    const speedNorm = clamp(Math.abs(speed) / 50, 0, 1);
    const engineFreq = 72 + speedNorm * 130 + Math.max(0, speed) * 1.4;
    this.engineOsc.frequency.setTargetAtTime(engineFreq, now, 0.03);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + speedNorm * 0.14 : 0.0001, now, 0.04);
    this.skidGain.gain.setTargetAtTime(active ? clamp((slip - 0.1) * 0.18, 0, 0.09) : 0.0001, now, 0.04);
  }

  playCountdown(label: string): void {
    if (!this.ctx) return;
    if (label === 'GO') {
      this.beep(880, 0.14, 'square', 0.08);
      this.beep(1180, 0.17, 'triangle', 0.05, 0.02);
      return;
    }
    this.beep(560, 0.08, 'square', 0.06);
  }

  playCollision(intensity: number): void {
    if (!this.ctx) return;
    const amp = clamp(intensity / 8, 0.02, 0.09);
    this.beep(140 + intensity * 25, 0.05, 'sawtooth', amp);
  }

  playFinish(rank: number): void {
    if (!this.ctx) return;
    const base = rank === 1 ? 660 : rank === 2 ? 590 : 500;
    this.beep(base, 0.14, 'triangle', 0.09);
    this.beep(base * 1.25, 0.15, 'triangle', 0.07, 0.08);
    this.beep(base * (rank === 1 ? 1.5 : 1.33), 0.18, 'sine', 0.05, 0.16);
  }

  playLapComplete(): void {
    if (!this.ctx) return;
    this.beep(700, 0.09, 'triangle', 0.06);
    this.beep(930, 0.1, 'triangle', 0.05, 0.06);
  }

  playMoment(kind: 'overtake' | 'warn'): void {
    if (!this.ctx) return;
    if (kind === 'overtake') {
      this.beep(980, 0.08, 'square', 0.05);
      this.beep(1240, 0.07, 'triangle', 0.04, 0.05);
      return;
    }
    this.beep(260, 0.07, 'sawtooth', 0.05);
  }

  dispose(): void {
    try {
      this.skidNoiseSource?.stop();
    } catch {
      // noop
    }
    this.skidNoiseSource = null;
    this.engineOsc?.stop();
    this.engineOsc = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.initialized = false;
  }

  private buildGraph(ctx: AudioContext): void {
    if (this.initialized) return;
    this.initialized = true;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.masterGain = master;

    const bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.028;
    bgmGain.connect(master);
    this.bgmGain = bgmGain;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0001;
    engineGain.connect(master);
    this.engineGain = engineGain;

    const skidGain = ctx.createGain();
    skidGain.gain.value = 0.0001;
    skidGain.connect(master);
    this.skidGain = skidGain;

    const bgmA = ctx.createOscillator();
    bgmA.type = 'triangle';
    bgmA.frequency.value = 110;
    bgmA.connect(bgmGain);
    bgmA.start();

    const bgmB = ctx.createOscillator();
    bgmB.type = 'sine';
    bgmB.frequency.value = 164.8;
    const bgmBGain = ctx.createGain();
    bgmBGain.gain.value = 0.016;
    bgmB.connect(bgmBGain);
    bgmBGain.connect(master);
    bgmB.start();

    const engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 80;
    engineOsc.connect(engineGain);
    engineOsc.start();
    this.engineOsc = engineOsc;

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1300;
    noiseFilter.Q.value = 0.7;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(skidGain);
    noiseSource.start();
    this.skidNoiseSource = noiseSource;

    this.updateMasterGain();
  }

  private updateMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : this.masterVolume;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  private beep(freq: number, durationSec: number, type: OscillatorType, gain: number, offsetSec = 0): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime + offsetSec;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(amp);
    amp.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }
}

import { clamp } from '../core/math';

export interface AudioStateSnapshot {
  muted: boolean;
  masterVolume: number;
}

export type UiClickTone = 'primary' | 'secondary' | 'toggle';

const UI_CLICK_COOLDOWN_MS = 50;
const STANDBY_TRACK_RELATIVE_URL = 'assets/audio/Pixel_Pavement.mp3';
const STANDBY_LOOP_GAIN = 0.14;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private gameplayGateGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private standbyGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private skidNoiseSource: AudioBufferSourceNode | null = null;
  private standbySource: AudioBufferSourceNode | null = null;
  private standbyBuffer: AudioBuffer | null = null;
  private standbyLoadPromise: Promise<AudioBuffer | null> | null = null;
  private standbyLoopActive = false;
  private muted = false;
  private paused = false;
  private masterVolume = 0.6;
  private initialized = false;
  private lastUiClickAtMs = 0;

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
    this.updateGameplayGateGain();
    if (this.standbyLoopActive) {
      void this.ensureStandbyLoop();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMasterGain();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.updateGameplayGateGain();
    if (!this.ctx || !this.engineGain || !this.skidGain) return;
    const now = this.ctx.currentTime;
    if (paused) {
      this.engineGain.gain.cancelScheduledValues(now);
      this.skidGain.gain.cancelScheduledValues(now);
      this.engineGain.gain.setValueAtTime(0, now);
      this.skidGain.gain.setValueAtTime(0, now);
    }
  }

  setStandbyLoopActive(active: boolean): void {
    if (this.standbyLoopActive === active) return;
    this.standbyLoopActive = active;
    if (!active) {
      this.stopStandbyLoop();
      return;
    }
    void this.ensureStandbyLoop();
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
    if (!active || this.paused) {
      // Keep engine/skid channels hard-muted until race phase is actively running.
      this.engineGain.gain.cancelScheduledValues(now);
      this.skidGain.gain.cancelScheduledValues(now);
      this.engineGain.gain.setValueAtTime(0, now);
      this.skidGain.gain.setValueAtTime(0, now);
      return;
    }
    const speedNorm = clamp(Math.abs(speed) / 50, 0, 1);
    const engineFreq = 72 + speedNorm * 130 + Math.max(0, speed) * 1.4;
    this.engineOsc.frequency.setTargetAtTime(engineFreq, now, 0.03);
    this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.14, now, 0.04);
    this.skidGain.gain.setTargetAtTime(clamp((slip - 0.1) * 0.18, 0, 0.09), now, 0.04);
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

  playOutOfBoundsExplosion(): void {
    if (!this.ctx) return;
    this.beep(210, 0.12, 'sawtooth', 0.08);
    this.beep(145, 0.16, 'square', 0.06, 0.02);
    this.beep(90, 0.2, 'triangle', 0.05, 0.05);
  }

  playRespawnCue(): void {
    if (!this.ctx) return;
    this.beep(480, 0.06, 'triangle', 0.04);
    this.beep(720, 0.07, 'triangle', 0.045, 0.05);
    this.beep(980, 0.08, 'sine', 0.04, 0.1);
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

  playOverdriveStart(): void {
    if (!this.ctx) return;
    this.beep(820, 0.06, 'triangle', 0.05);
    this.beep(1120, 0.08, 'square', 0.045, 0.04);
    this.beep(1480, 0.1, 'sine', 0.04, 0.08);
  }

  playOverdriveFail(): void {
    if (!this.ctx) return;
    this.beep(230, 0.08, 'sawtooth', 0.05);
    this.beep(170, 0.1, 'square', 0.045, 0.03);
  }

  playUiClick(tone: UiClickTone = 'secondary'): void {
    if (this.muted) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastUiClickAtMs < UI_CLICK_COOLDOWN_MS) return;
    this.lastUiClickAtMs = nowMs;

    void this.unlock()
      .then(() => {
        if (this.muted) return;
        switch (tone) {
          case 'primary':
            this.uiBeep(900, 0.045, 'triangle', 0.055);
            this.uiBeep(1220, 0.05, 'sine', 0.04, 0.015);
            break;
          case 'toggle':
            this.uiBeep(560, 0.04, 'square', 0.045);
            break;
          case 'secondary':
          default:
            this.uiBeep(720, 0.035, 'triangle', 0.042);
            break;
        }
      })
      .catch(() => undefined);
  }

  dispose(): void {
    this.stopStandbyLoop();
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

    const gameplayGate = ctx.createGain();
    gameplayGate.gain.value = 1;
    gameplayGate.connect(master);
    this.gameplayGateGain = gameplayGate;

    const uiGain = ctx.createGain();
    uiGain.gain.value = 0.22;
    uiGain.connect(master);
    this.uiGain = uiGain;

    const standbyGain = ctx.createGain();
    standbyGain.gain.value = STANDBY_LOOP_GAIN;
    standbyGain.connect(master);
    this.standbyGain = standbyGain;

    const bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.028;
    bgmGain.connect(gameplayGate);
    this.bgmGain = bgmGain;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(gameplayGate);
    this.engineGain = engineGain;

    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidGain.connect(gameplayGate);
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
    bgmBGain.connect(gameplayGate);
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
    this.updateGameplayGateGain();
  }

  private updateMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : this.masterVolume;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  private updateGameplayGateGain(): void {
    if (!this.ctx || !this.gameplayGateGain) return;
    const target = this.paused ? 0 : 1;
    this.gameplayGateGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  private beep(freq: number, durationSec: number, type: OscillatorType, gain: number, offsetSec = 0): void {
    if (!this.ctx || !this.gameplayGateGain) return;
    const now = this.ctx.currentTime + offsetSec;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(amp);
    amp.connect(this.gameplayGateGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  private uiBeep(freq: number, durationSec: number, type: OscillatorType, gain: number, offsetSec = 0): void {
    if (!this.ctx || !this.uiGain) return;
    const now = this.ctx.currentTime + offsetSec;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(amp);
    amp.connect(this.uiGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  private async ensureStandbyLoop(): Promise<void> {
    if (!this.standbyLoopActive || !this.ctx || !this.standbyGain) return;
    if (this.ctx.state !== 'running') return;
    if (this.standbySource) return;

    const buffer = await this.getStandbyBuffer();
    if (!buffer || !this.standbyLoopActive || !this.ctx || !this.standbyGain || this.standbySource) {
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.standbyGain);
    source.start();
    source.onended = () => {
      if (this.standbySource === source) {
        this.standbySource = null;
      }
    };
    this.standbySource = source;
  }

  private async getStandbyBuffer(): Promise<AudioBuffer | null> {
    if (this.standbyBuffer) return this.standbyBuffer;
    if (!this.ctx) return null;
    if (this.standbyLoadPromise) return this.standbyLoadPromise;

    this.standbyLoadPromise = fetch(this.getStandbyTrackUrl(), { cache: 'force-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`failed to fetch standby track (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (!this.ctx) return null;
        const decoded = await this.ctx.decodeAudioData(arrayBuffer);
        this.standbyBuffer = decoded;
        return decoded;
      })
      .catch((error) => {
        console.warn('[AudioManager] standby loop load failed:', error);
        return null;
      })
      .finally(() => {
        this.standbyLoadPromise = null;
      });

    return this.standbyLoadPromise;
  }

  private getStandbyTrackUrl(): string {
    const base = import.meta.env.BASE_URL ?? '/';
    return `${base}${STANDBY_TRACK_RELATIVE_URL}`;
  }

  private stopStandbyLoop(): void {
    if (!this.standbySource) return;
    try {
      this.standbySource.stop();
    } catch {
      // noop
    }
    this.standbySource.disconnect();
    this.standbySource = null;
  }
}

import { EventBus } from '../core/EventBus';
import { clamp, formatMs } from '../core/math';
import { CpuDriver } from '../ai/CpuDriver';
import { Rubberband } from '../ai/Rubberband';
import { CountdownSystem } from './CountdownSystem';
import { LapTracker } from './LapTracker';
import { PositionSystem } from './PositionSystem';
import { TrackProgress } from '../track/TrackProgress';
import { ArcadePhysics } from '../vehicle/ArcadePhysics';
import { Vehicle } from '../vehicle/Vehicle';
import type { GameEvents } from './GameState';
import type { GameConfig, InputState, RacePhase, RaceSnapshot, RaceState, TrackDefinition, UiMessageTone, VehicleParams, VehicleState } from '../types/game';
import { CPU_COLORS, PLAYER_COLOR } from '../data/config';

export interface RaceManagerOptions {
  track: TrackDefinition;
  config: GameConfig;
  vehicleParams: VehicleParams;
  eventBus: EventBus<GameEvents>;
  initialBestLapMs: number | null;
}

interface RuntimeVehicle {
  entity: Vehicle;
  cpuDriver?: CpuDriver;
  lowSpeedStuckMs: number;
}

const RESET_COOLDOWN_MS = 3000;

export class RaceManager {
  readonly trackProgress: TrackProgress;
  private readonly physics = new ArcadePhysics();
  private readonly countdown = new CountdownSystem();
  private readonly positionSystem = new PositionSystem();
  private readonly rubberband = new Rubberband();
  private readonly runtimeVehicles: RuntimeVehicle[] = [];
  private lapTracker: LapTracker;

  private phase: RacePhase = 'menu';
  private phaseBeforePause: RacePhase = 'menu';
  private elapsedMs = 0;
  private message: string | null = null;
  private messageTone: UiMessageTone = 'info';
  private messageMsRemaining = 0;
  private bestLapMs: number | null;
  private finishCounter = 0;
  private leaderboard = [] as RaceState['leaderboard'];
  private playerLastRank: number | null = null;
  private driftPraiseCooldownMs = 0;
  private driftAccumMs = 0;
  private offTrackWarnCooldownMs = 0;
  private rankFeedbackCooldownMs = 0;
  private speedHypeCooldownMs = 0;
  private driftBoostHypeCooldownMs = 0;

  constructor(private readonly options: RaceManagerOptions) {
    this.trackProgress = new TrackProgress(options.track);
    this.lapTracker = new LapTracker(options.track, options.config.laps);
    this.bestLapMs = options.initialBestLapMs;
    this.createVehicles();
    this.resetRaceInternals();
    this.phase = 'menu';
  }

  getVehicles(): VehicleState[] {
    return this.runtimeVehicles.map((rv) => rv.entity.state);
  }

  getPlayerVehicle(): VehicleState {
    const player = this.runtimeVehicles.find((rv) => rv.entity.state.isPlayer);
    if (!player) throw new Error('Player vehicle missing');
    return player.entity.state;
  }

  getPhase(): RacePhase {
    return this.phase;
  }

  getSnapshot(): RaceSnapshot {
    return {
      race: this.getRaceState(),
      vehicles: this.getVehicles(),
      countdown: this.countdown.snapshot(),
      message: this.message,
      messageTone: this.messageTone,
    };
  }

  getRaceState(): RaceState {
    const player = this.getPlayerVehicle();
    return {
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      leaderboard: this.leaderboard,
      bestLapMs: this.bestLapMs,
      currentLapMs: player.currentLapMs,
    };
  }

  startRace(): void {
    this.resetRaceInternals();
    this.phase = 'countdown';
    this.countdown.start();
    this.setMessage('3ラップ / まずは1コーナーを丁寧に', 1800, 'info');
  }

  returnToMenu(): void {
    this.phase = 'menu';
    this.countdown.stop();
    this.setMessage(null, 0);
  }

  restartRace(): void {
    this.startRace();
  }

  togglePause(): void {
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
      this.setMessage(null, 0);
      this.options.eventBus.emit('ui:pauseToggled', { paused: false });
      return;
    }
    if (this.phase !== 'racing' && this.phase !== 'countdown') {
      return;
    }
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.setMessage('ポーズ中', 0, 'info');
    this.options.eventBus.emit('ui:pauseToggled', { paused: true });
  }

  update(dtSec: number, playerInput: InputState): void {
    this.updateMessage(dtSec);

    if (playerInput.pause) {
      this.togglePause();
    }

    if (this.phase === 'paused' || this.phase === 'menu') {
      return;
    }

    if (this.phase === 'countdown') {
      const countdownResult = this.countdown.update(dtSec);
      if (countdownResult.changedLabel) {
        this.options.eventBus.emit('race:countdownTick', { label: countdownResult.changedLabel });
      }
      if (countdownResult.startRaceNow) {
        this.countdown.stop();
        this.phase = 'racing';
        this.setMessage('GO!', 900);
        this.options.eventBus.emit('race:start', { atMs: this.elapsedMs });
      }
      return;
    }

    if (this.phase !== 'racing') {
      return;
    }

    this.elapsedMs += dtSec * 1000;
    this.driftPraiseCooldownMs = Math.max(0, this.driftPraiseCooldownMs - dtSec * 1000);
    this.offTrackWarnCooldownMs = Math.max(0, this.offTrackWarnCooldownMs - dtSec * 1000);
    this.rankFeedbackCooldownMs = Math.max(0, this.rankFeedbackCooldownMs - dtSec * 1000);
    this.speedHypeCooldownMs = Math.max(0, this.speedHypeCooldownMs - dtSec * 1000);
    this.driftBoostHypeCooldownMs = Math.max(0, this.driftBoostHypeCooldownMs - dtSec * 1000);

    const vehicleStates = this.getVehicles();
    const rankById = new Map(this.leaderboard.map((entry) => [entry.vehicleId, entry.rank]));

    for (const rv of this.runtimeVehicles) {
      const state = rv.entity.state;
      state.resetCooldownMs = Math.max(0, state.resetCooldownMs - dtSec * 1000);

      if (state.finished) {
        state.currentLapMs = state.lapTimesMs[state.lapTimesMs.length - 1] ?? state.currentLapMs;
        continue;
      }

      let input = playerInput;
      if (!state.isPlayer) {
        const rank = rankById.get(state.id) ?? this.runtimeVehicles.length;
        const speedMultiplier = this.rubberband.getMultiplier(rank, this.runtimeVehicles.length);
        input = rv.cpuDriver!.update({
          trackProgress: this.trackProgress,
          vehicle: state,
          allVehicles: vehicleStates,
          speedMultiplier,
        });
      }

      if (state.isPlayer && input.reset && state.resetCooldownMs <= 0) {
        this.respawnVehicle(state);
        this.setMessage('車体をリセットしました', 1200);
      }

      const preSample = this.trackProgress.sample({ x: state.position.x, z: state.position.z });
      const offTrack = preSample.distance > preSample.width * 0.5;
      state.isOffTrack = offTrack;

      const speedMultiplier = 1;
      this.physics.step(state, input, rv.entity.params, {
        dt: dtSec,
        surface: offTrack ? 'grass' : 'road',
        offTrack,
        speedMultiplier,
      });

      this.applyTrackBoundary(state);

      if (state.isPlayer) {
        this.updatePlayerMomentFeedback(state, dtSec);
      }

      if (!state.isPlayer) {
        const speedAbs = Math.abs(state.speedForward);
        rv.lowSpeedStuckMs = speedAbs < 0.8 ? rv.lowSpeedStuckMs + dtSec * 1000 : 0;
        if (rv.lowSpeedStuckMs > 2500) {
          this.respawnVehicle(state);
          rv.lowSpeedStuckMs = 0;
        }
      }
    }

    for (let i = 0; i < this.runtimeVehicles.length; i += 1) {
      for (let j = i + 1; j < this.runtimeVehicles.length; j += 1) {
        const a = this.runtimeVehicles[i].entity.state;
        const b = this.runtimeVehicles[j].entity.state;
        const impulse = this.physics.resolveCollision(
          a,
          this.runtimeVehicles[i].entity.params.radius,
          b,
          this.runtimeVehicles[j].entity.params.radius,
          this.options.vehicleParams.collisionDamping,
        );
        if (impulse > 0.2) {
          this.options.eventBus.emit('car:collision', { a: a.id, b: b.id, impulse });
        }
      }
    }

    const newlyFinished: VehicleState[] = [];

    for (const rv of this.runtimeVehicles) {
      const state = rv.entity.state;
      const sample = this.trackProgress.sample({ x: state.position.x, z: state.position.z });
      const lapState = this.lapTracker.getState(state.id);

      state.progress01 = sample.progress01;
      state.isOffTrack = sample.distance > sample.width * 0.5;
      state.respawnWaypointIndex = sample.waypointIndex;
      state.checkpointIndex = lapState.lastPassedCheckpointIndex;
      state.lap = lapState.lap;
      state.currentLapMs = state.finished ? state.currentLapMs : Math.max(0, Math.floor(this.elapsedMs - lapState.lapStartMs));
      state.lapTimesMs = [...lapState.lapTimesMs];

      const checkpointScale = Math.max(1, this.options.track.checkpoints.length);
      state.progressMetric = state.lap * checkpointScale + state.checkpointIndex + sample.progress01;

      const lapUpdate = this.lapTracker.updateVehicle(state.id, state.position.x, state.position.z, this.elapsedMs);
      if (lapUpdate.checkpointPassed !== null) {
        state.checkpointIndex = lapUpdate.checkpointPassed;
      }
      if (lapUpdate.lapCompleted !== null && lapUpdate.lapTimeMs !== null) {
        state.lap = lapUpdate.lapCompleted;
        state.lapTimesMs = [...this.lapTracker.getState(state.id).lapTimesMs];
        state.currentLapMs = 0;
        const prevBest = this.bestLapMs;
        this.options.eventBus.emit('race:lapComplete', {
          vehicleId: state.id,
          lap: lapUpdate.lapCompleted,
          lapTimeMs: lapUpdate.lapTimeMs,
        });
        if (state.isPlayer) {
          const isBest = prevBest === null || lapUpdate.lapTimeMs < prevBest;
          this.bestLapMs = prevBest === null ? lapUpdate.lapTimeMs : Math.min(prevBest, lapUpdate.lapTimeMs);
          if (isBest) {
            this.setMessage(`自己ベスト! L${lapUpdate.lapCompleted} ${formatMs(lapUpdate.lapTimeMs)}`, 1400, 'hype');
          } else {
            this.setMessage(`L${lapUpdate.lapCompleted} ${formatMs(lapUpdate.lapTimeMs)}`, 1100, 'info');
          }
        }
      }
      if (lapUpdate.finished && !state.finished) {
        state.finished = true;
        state.finishOrder = ++this.finishCounter;
        newlyFinished.push(state);
      }
    }

    this.leaderboard = this.positionSystem.computeLeaderboard(this.getVehicles());
    this.updatePlayerRankFeedback();

    if (newlyFinished.length > 0) {
      const snapshot = this.getSnapshot();
      for (const finished of newlyFinished) {
        this.options.eventBus.emit('race:finish', {
          vehicleId: finished.id,
          finishOrder: finished.finishOrder ?? this.finishCounter,
          snapshot,
        });
      }
      const player = newlyFinished.find((v) => v.isPlayer);
      if (player) {
        this.phase = 'finished';
        this.setMessage(this.getFinishMessage(player.finishOrder ?? this.finishCounter), 0, 'result');
      }
    }
  }

  private createVehicles(): void {
    const playerSpawn = this.options.track.startGrid[0] ?? { x: 0, y: 0, z: 0, yaw: 0 };
    this.runtimeVehicles.push({
      entity: new Vehicle(this.options.vehicleParams, {
        id: 'player',
        name: 'YOU',
        isPlayer: true,
        colorHex: PLAYER_COLOR,
        spawn: playerSpawn,
      }),
      lowSpeedStuckMs: 0,
    });

    for (let i = 0; i < this.options.config.cpuCount; i += 1) {
      const spawn = this.options.track.startGrid[i + 1] ?? {
        x: playerSpawn.x + (i % 2 === 0 ? -2 : 2),
        y: 0,
        z: playerSpawn.z - 4 - i * 3,
        yaw: playerSpawn.yaw,
      };
      this.runtimeVehicles.push({
        entity: new Vehicle(this.options.vehicleParams, {
          id: `cpu-${i + 1}`,
          name: `CPU ${i + 1}`,
          isPlayer: false,
          colorHex: CPU_COLORS[i % CPU_COLORS.length],
          spawn,
        }),
        cpuDriver: new CpuDriver(),
        lowSpeedStuckMs: 0,
      });
    }
  }

  private resetRaceInternals(): void {
    this.elapsedMs = 0;
    this.finishCounter = 0;
    this.message = null;
    this.messageTone = 'info';
    this.messageMsRemaining = 0;
    this.playerLastRank = null;
    this.driftPraiseCooldownMs = 0;
    this.driftAccumMs = 0;
    this.offTrackWarnCooldownMs = 0;
    this.rankFeedbackCooldownMs = 0;
    this.speedHypeCooldownMs = 0;
    this.driftBoostHypeCooldownMs = 0;
    this.countdown.stop();
    this.lapTracker = new LapTracker(this.options.track, this.options.config.laps);

    for (let i = 0; i < this.runtimeVehicles.length; i += 1) {
      const spawn = this.options.track.startGrid[i] ?? this.options.track.startGrid[0];
      this.runtimeVehicles[i].entity.resetToSpawn(spawn);
      this.runtimeVehicles[i].lowSpeedStuckMs = 0;
      this.lapTracker.registerVehicle(this.runtimeVehicles[i].entity.state.id, 0);
      const sample = this.trackProgress.sample({
        x: this.runtimeVehicles[i].entity.state.position.x,
        z: this.runtimeVehicles[i].entity.state.position.z,
      });
      this.runtimeVehicles[i].entity.state.respawnWaypointIndex = sample.waypointIndex;
      this.runtimeVehicles[i].entity.state.progress01 = sample.progress01;
    }

    this.leaderboard = this.positionSystem.computeLeaderboard(this.getVehicles());
    this.playerLastRank = this.leaderboard.find((entry) => entry.isPlayer)?.rank ?? null;
  }

  private respawnVehicle(state: VehicleState): void {
    const respawn = this.trackProgress.getRespawnTransform(state.respawnWaypointIndex);
    state.position.x = respawn.x;
    state.position.y = 0;
    state.position.z = respawn.z;
    state.yaw = respawn.yaw;
    state.velocityWorld.x = 0;
    state.velocityWorld.y = 0;
    state.velocityWorld.z = 0;
    state.speedForward = 0;
    state.steerVisual = 0;
    state.slipRatio = 0;
    state.driftActive = false;
    state.driftChargeMs = 0;
    state.driftBoostMs = 0;
    state.driftBoostStrength = 0;
    state.resetCooldownMs = RESET_COOLDOWN_MS;
  }

  private applyTrackBoundary(state: VehicleState): void {
    const sample = this.trackProgress.sample({ x: state.position.x, z: state.position.z });
    const halfWidth = sample.width * 0.5;
    const limit = halfWidth + this.options.track.hardBoundaryMargin;
    if (sample.distance <= limit) return;

    const clamped = this.trackProgress.nearestPointInsideTrack({ x: state.position.x, z: state.position.z }, sample);
    const dx = state.position.x - clamped.x;
    const dz = state.position.z - clamped.z;
    state.position.x = clamped.x;
    state.position.z = clamped.z;

    const normalLen = Math.hypot(dx, dz);
    if (normalLen > 1e-6) {
      const nx = dx / normalLen;
      const nz = dz / normalLen;
      const vn = state.velocityWorld.x * nx + state.velocityWorld.z * nz;
      if (vn > 0) {
        state.velocityWorld.x -= nx * vn * 1.2;
        state.velocityWorld.z -= nz * vn * 1.2;
      }
      state.velocityWorld.x *= 0.96;
      state.velocityWorld.z *= 0.96;
    }
  }

  private setMessage(text: string | null, durationMs: number, tone: UiMessageTone = 'info'): void {
    this.message = text;
    this.messageTone = tone;
    this.messageMsRemaining = durationMs;
  }

  private updateMessage(dtSec: number): void {
    if (this.messageMsRemaining <= 0) return;
    this.messageMsRemaining -= dtSec * 1000;
    if (this.messageMsRemaining <= 0) {
      this.messageMsRemaining = 0;
      if (this.phase !== 'paused') {
        this.message = null;
        this.messageTone = 'info';
      }
    }
  }

  private updatePlayerMomentFeedback(state: VehicleState, dtSec: number): void {
    const speedKmh = Math.abs(state.speedForward) * 3.6;
    const drifting = !state.isOffTrack && speedKmh > 35 && (state.driftActive || state.slipRatio > 0.28);
    if (drifting) {
      this.driftAccumMs += dtSec * 1000;
      if (this.driftAccumMs > 420 && this.driftPraiseCooldownMs <= 0) {
        this.setMessage(speedKmh > 85 ? 'いいドリフト! そのまま立ち上がれ' : 'ナイスドリフト!', 900, 'hype');
        this.driftPraiseCooldownMs = 2200;
      }
    } else {
      this.driftAccumMs = Math.max(0, this.driftAccumMs - dtSec * 1600);
    }

    if (state.driftBoostMs > 0 && state.driftBoostStrength >= 0.35 && this.driftBoostHypeCooldownMs <= 0) {
      this.setMessage('DRIFT BOOST! 立ち上がりで稼げ!', 850, 'hype');
      this.driftBoostHypeCooldownMs = 1800;
    }

    if (state.isOffTrack && speedKmh > 35 && this.offTrackWarnCooldownMs <= 0) {
      this.setMessage('芝に乗りすぎ! 路面に戻そう', 850, 'warn');
      this.offTrackWarnCooldownMs = 2800;
    }

    if (speedKmh > 120 && this.speedHypeCooldownMs <= 0) {
      this.setMessage('ハイスピード! ブレーキング勝負', 800, 'hype');
      this.speedHypeCooldownMs = 3500;
    }
  }

  private updatePlayerRankFeedback(): void {
    const playerRank = this.leaderboard.find((entry) => entry.isPlayer)?.rank ?? null;
    if (playerRank === null) return;
    if (this.playerLastRank === null) {
      this.playerLastRank = playerRank;
      return;
    }
    if (playerRank === this.playerLastRank) return;

    const previousRank = this.playerLastRank;
    this.playerLastRank = playerRank;

    if (this.phase !== 'racing' || this.elapsedMs < 1200 || this.rankFeedbackCooldownMs > 0) {
      return;
    }

    if (playerRank < previousRank) {
      this.setMessage(`オーバーテイク! ${playerRank}位`, 900, 'hype');
    } else {
      this.setMessage(`${playerRank}位に後退… 取り返そう`, 900, 'warn');
    }
    this.rankFeedbackCooldownMs = 1200;
  }

  private getFinishMessage(rank: number): string {
    if (rank === 1) return '優勝! 完璧なレース!';
    if (rank === 2) return '2位フィニッシュ! 惜しい!';
    if (rank === 3) return '3位フィニッシュ! 次は表彰台の真ん中へ';
    return '完走! ライン取りを詰めて再挑戦';
  }
}

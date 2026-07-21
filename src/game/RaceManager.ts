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
import type {
  ComboSource,
  GameConfig,
  InputState,
  OverdriveState,
  OutOfBoundsReason,
  RacePhase,
  RaceSnapshot,
  RaceState,
  TrackDefinition,
  TrackSample,
  UiMessageTone,
  VehicleParams,
  VehicleState,
} from '../types/game';
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
const OOB_EXTRA_MARGIN = 8.5;
const OOB_RESPAWN_DELAY_MS = 2000;
const OOB_RETRIGGER_COOLDOWN_MS = 400;
const OOB_EXPLOSION_VISIBLE_MS = 350;
const WALL_TOUCH_EPS = 0.15;
const PLAYER_OOB_WALL_EXPAND = 2.5;
const COMBO_STEP_MS = 1700;
const COMBO_MAX_LEVEL = 8;
const OVERDRIVE_MIN_METER = 0.35;
const OVERDRIVE_MIN_DURATION_MS = 1000;
const OVERDRIVE_MAX_DURATION_MS = 2600;
const OVERDRIVE_MIN_SPEED_MULTIPLIER = 1.18;
const OVERDRIVE_MAX_SPEED_MULTIPLIER = 1.42;
const OVERDRIVE_MIN_ACCEL_MULTIPLIER = 1.24;
const OVERDRIVE_MAX_ACCEL_MULTIPLIER = 1.55;
const OVERDRIVE_PENALTY_MS = 2200;
const OVERDRIVE_PENALTY_SPEED_MULTIPLIER = 0.72;
const OVERDRIVE_PENALTY_ACCEL_MULTIPLIER = 0.68;
const OVERDRIVE_WARN_COOLDOWN_MS = 1000;
const OVERDRIVE_DRIFT_GAIN_PER_SEC = 0.78;
const OVERDRIVE_WALL_GAIN_PER_SEC = 1.02;
const OVERDRIVE_IDLE_DECAY_PER_SEC = 0.085;
const OVERDRIVE_OVERTAKE_BONUS = 0.12;
const OVERDRIVE_FAIL_COLLISION_IMPULSE = 0.7;
const CPU_ADAPTIVE_TICK_MS = 2000;

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
  private comboLevel = 0;
  private maxCombo = 0;
  private comboMeterMs = 0;
  private comboSource: ComboSource = 'none';
  private comboDriftMs = 0;
  private comboStraightMs = 0;
  private overdriveState: OverdriveState = 'idle';
  private overdriveMeter01 = 0;
  private overdriveActiveMs = 0;
  private overdrivePenaltyMs = 0;
  private overdriveSpeedMultiplier = 1;
  private overdriveAccelMultiplier = 1;
  private overdriveBoostQueued = false;
  private overdriveBoostWarnCooldownMs = 0;
  private cpuAdaptiveBias = 0;
  private cpuAdaptiveTickMs = 0;

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
      comboLevel: this.comboLevel,
      maxCombo: this.maxCombo,
      comboMeter01: this.comboLevel > 0 ? clamp(this.comboMeterMs / COMBO_STEP_MS, 0, 1) : 0,
      comboSource: this.comboSource,
      comboSpeedMultiplier: this.getPlayerComboSpeedMultiplier(player),
      overdriveState: this.overdriveState,
      overdriveMeter01: this.overdriveMeter01,
      overdriveActiveMs: Math.max(0, Math.floor(this.overdriveActiveMs)),
      overdrivePenaltyMs: Math.max(0, Math.floor(this.overdrivePenaltyMs)),
      overdriveSpeedMultiplier: this.getPlayerOverdriveSpeedMultiplier(),
      cpuAdaptiveBias: this.cpuAdaptiveBias,
    };
  }

  startRace(): void {
    this.resetRaceInternals();
    this.phase = 'countdown';
    this.countdown.start();
    this.setMessage(this.getStartMessageByTheme(), 1800, 'info');
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
      this.overdriveBoostQueued = false;
      return;
    }

    if (this.phase === 'countdown') {
      this.overdriveBoostQueued = playerInput.boostHeld;
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
      this.overdriveBoostQueued = false;
      return;
    }

    this.elapsedMs += dtSec * 1000;
    this.driftPraiseCooldownMs = Math.max(0, this.driftPraiseCooldownMs - dtSec * 1000);
    this.offTrackWarnCooldownMs = Math.max(0, this.offTrackWarnCooldownMs - dtSec * 1000);
    this.rankFeedbackCooldownMs = Math.max(0, this.rankFeedbackCooldownMs - dtSec * 1000);
    this.speedHypeCooldownMs = Math.max(0, this.speedHypeCooldownMs - dtSec * 1000);
    this.driftBoostHypeCooldownMs = Math.max(0, this.driftBoostHypeCooldownMs - dtSec * 1000);
    this.updateOverdriveRuntime(dtSec);

    const vehicleStates = this.getVehicles();
    const rankById = new Map(this.leaderboard.map((entry) => [entry.vehicleId, entry.rank]));
    this.cpuAdaptiveTickMs += dtSec * 1000;

    for (const rv of this.runtimeVehicles) {
      const state = rv.entity.state;
      state.resetCooldownMs = Math.max(0, state.resetCooldownMs - dtSec * 1000);
      state.oobCooldownMs = Math.max(0, state.oobCooldownMs - dtSec * 1000);

      if (state.outOfBoundsState !== 'none') {
        if (state.isPlayer) {
          this.updateOutOfBoundsTimer(state, dtSec);
        }
        continue;
      }

      if (state.finished) {
        state.currentLapMs = state.lapTimesMs[state.lapTimesMs.length - 1] ?? state.currentLapMs;
        continue;
      }

      let input = playerInput;
      if (!state.isPlayer) {
        const rank = rankById.get(state.id) ?? this.runtimeVehicles.length;
        const speedMultiplier = this.rubberband.getMultiplier(rank, this.runtimeVehicles.length, this.cpuAdaptiveBias);
        input = rv.cpuDriver!.update({
          trackProgress: this.trackProgress,
          vehicle: state,
          allVehicles: vehicleStates,
          speedMultiplier,
        });
      }

      const preSample = this.trackProgress.sample({ x: state.position.x, z: state.position.z });
      const offTrack = preSample.distance > preSample.width * 0.5;
      state.isOffTrack = offTrack;
      if (state.isPlayer) {
        this.captureSafePose(state, preSample);
        this.handlePlayerOverdriveInput(input.boost, input.boostHeld);
      }

      const speedMultiplier = state.isPlayer ? this.getPlayerRaceSpeedMultiplier(state) : 1;
      const accelMultiplier = state.isPlayer ? this.getPlayerOverdriveAccelMultiplier() : 1;
      this.physics.step(state, input, rv.entity.params, {
        dt: dtSec,
        surface: offTrack ? 'grass' : 'road',
        offTrack,
        speedMultiplier,
        accelMultiplier,
      });

      const postSample = this.trackProgress.sample({ x: state.position.x, z: state.position.z });
      state.isOffTrack = postSample.distance > postSample.width * 0.5;

      if (state.isPlayer) {
        this.captureSafePose(state, postSample);
        this.updateOverdriveMeter(state, postSample, dtSec);
        this.tryActivateQueuedOverdrive(input.boostHeld);
        if (this.isPlayerFellOff(postSample)) {
          this.triggerOutOfBounds(state, 'fell-off');
          continue;
        }
        if (this.isPlayerWallTouch(postSample)) {
          this.triggerOutOfBounds(state, 'wall-contact');
          continue;
        }
      } else {
        this.applyTrackBoundary(state);
      }

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
        if (a.outOfBoundsState !== 'none' || b.outOfBoundsState !== 'none') {
          continue;
        }
        const impulse = this.physics.resolveCollision(
          a,
          this.runtimeVehicles[i].entity.params.radius,
          b,
          this.runtimeVehicles[j].entity.params.radius,
          this.options.vehicleParams.collisionDamping,
        );
        if (impulse > 0.2) {
          this.options.eventBus.emit('car:collision', { a: a.id, b: b.id, impulse });
          if (a.id === 'player' || b.id === 'player') {
            if (impulse >= OVERDRIVE_FAIL_COLLISION_IMPULSE && this.overdriveState === 'active') {
              this.failOverdrive('collision');
            }
            if (impulse > 0.78) {
              this.breakCombo('hit');
            }
          }
        }
      }
    }

    const newlyFinished: VehicleState[] = [];

    for (const rv of this.runtimeVehicles) {
      const state = rv.entity.state;
      const lapState = this.lapTracker.getState(state.id);

      if (state.outOfBoundsState !== 'none') {
        state.checkpointIndex = lapState.lastPassedCheckpointIndex;
        state.lap = lapState.lap;
        state.lapTimesMs = [...lapState.lapTimesMs];
        state.currentLapMs = state.finished ? state.currentLapMs : Math.max(0, Math.floor(this.elapsedMs - lapState.lapStartMs));
        continue;
      }

      const sample = this.trackProgress.sample({ x: state.position.x, z: state.position.z });

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
    if (this.cpuAdaptiveTickMs >= CPU_ADAPTIVE_TICK_MS) {
      this.cpuAdaptiveTickMs = 0;
      this.updateCpuAdaptiveBias();
    }
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
    this.resetComboState();
    this.resetOverdriveState();
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
      this.runtimeVehicles[i].entity.state.lastSafeRespawnWaypointIndex = sample.waypointIndex;
      this.runtimeVehicles[i].entity.state.lastSafePosition.x = this.runtimeVehicles[i].entity.state.position.x;
      this.runtimeVehicles[i].entity.state.lastSafePosition.y = this.runtimeVehicles[i].entity.state.position.y;
      this.runtimeVehicles[i].entity.state.lastSafePosition.z = this.runtimeVehicles[i].entity.state.position.z;
      this.runtimeVehicles[i].entity.state.lastSafeYaw = this.runtimeVehicles[i].entity.state.yaw;
      this.runtimeVehicles[i].entity.state.hasLastSafePose = true;
    }

    this.leaderboard = this.positionSystem.computeLeaderboard(this.getVehicles());
    this.playerLastRank = this.leaderboard.find((entry) => entry.isPlayer)?.rank ?? null;
    this.cpuAdaptiveBias = 0;
    this.cpuAdaptiveTickMs = 0;
  }

  private respawnVehicle(state: VehicleState): void {
    const respawn = this.trackProgress.getRespawnTransform(state.respawnWaypointIndex);
    state.position.x = respawn.x;
    state.position.y = 0;
    state.position.z = respawn.z;
    state.yaw = respawn.yaw;
    this.resetVehicleKinematics(state);
    state.resetCooldownMs = RESET_COOLDOWN_MS;
    state.outOfBoundsState = 'none';
    state.outOfBoundsRespawnMs = 0;
    state.oobCooldownMs = 0;
    state.lastSafePosition.x = state.position.x;
    state.lastSafePosition.y = state.position.y;
    state.lastSafePosition.z = state.position.z;
    state.lastSafeYaw = state.yaw;
    state.hasLastSafePose = true;
    state.lastSafeRespawnWaypointIndex = state.respawnWaypointIndex;
  }

  private respawnVehicleToSafePose(state: VehicleState): void {
    if (state.hasLastSafePose) {
      state.position.x = state.lastSafePosition.x;
      state.position.y = state.lastSafePosition.y;
      state.position.z = state.lastSafePosition.z;
      state.yaw = state.lastSafeYaw;
      state.respawnWaypointIndex = state.lastSafeRespawnWaypointIndex;
      this.resetVehicleKinematics(state);
      state.outOfBoundsState = 'none';
      state.outOfBoundsRespawnMs = 0;
      state.oobCooldownMs = OOB_RETRIGGER_COOLDOWN_MS;
      state.resetCooldownMs = Math.max(state.resetCooldownMs, 350);
      this.options.eventBus.emit('car:respawned', {
        vehicleId: state.id,
        x: state.position.x,
        y: state.position.y,
        z: state.position.z,
      });
      return;
    }
    this.respawnVehicle(state);
    state.oobCooldownMs = OOB_RETRIGGER_COOLDOWN_MS;
    this.options.eventBus.emit('car:respawned', {
      vehicleId: state.id,
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
    });
  }

  private resetVehicleKinematics(state: VehicleState): void {
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
  }

  private captureSafePose(state: VehicleState, sample: TrackSample): void {
    if (!state.isPlayer) return;
    const safeRadius = sample.width * 0.45;
    if (sample.distance > safeRadius) return;
    state.lastSafePosition.x = state.position.x;
    state.lastSafePosition.y = state.position.y;
    state.lastSafePosition.z = state.position.z;
    state.lastSafeYaw = state.yaw;
    state.hasLastSafePose = true;
    state.lastSafeRespawnWaypointIndex = sample.waypointIndex;
  }

  private getBaseBoundaryLimit(sample: TrackSample): number {
    return sample.width * 0.5 + this.options.track.hardBoundaryMargin;
  }

  private getPlayerWallLimit(sample: TrackSample): number {
    return this.getBaseBoundaryLimit(sample) + PLAYER_OOB_WALL_EXPAND;
  }

  private isPlayerWallTouch(sample: TrackSample): boolean {
    return sample.distance >= this.getPlayerWallLimit(sample) - WALL_TOUCH_EPS;
  }

  private isPlayerFellOff(sample: TrackSample): boolean {
    return sample.distance >= this.getPlayerWallLimit(sample) + OOB_EXTRA_MARGIN;
  }

  private triggerOutOfBounds(state: VehicleState, reason: OutOfBoundsReason): void {
    if (!state.isPlayer || state.outOfBoundsState !== 'none') return;
    const overdriveWasActive = this.overdriveState === 'active';
    if (overdriveWasActive) {
      this.failOverdrive(reason, false);
    }
    state.outOfBoundsState = 'exploding';
    state.outOfBoundsRespawnMs = OOB_RESPAWN_DELAY_MS;
    this.resetVehicleKinematics(state);
    this.breakCombo('oob');
    const label = overdriveWasActive
      ? 'OVERHEAT! 2秒後に復帰'
      : reason === 'wall-contact'
        ? '壁に接触! 2秒後に復帰'
        : '場外! 2秒後に復帰';
    this.setMessage(label, 1200, 'warn');
    this.options.eventBus.emit('car:oob', {
      vehicleId: state.id,
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
      reason,
    });
  }

  private updateOutOfBoundsTimer(state: VehicleState, dtSec: number): void {
    if (state.outOfBoundsState === 'none') return;
    const prev = state.outOfBoundsRespawnMs;
    state.outOfBoundsRespawnMs = Math.max(0, state.outOfBoundsRespawnMs - dtSec * 1000);
    if (state.outOfBoundsState === 'exploding' && state.outOfBoundsRespawnMs <= OOB_RESPAWN_DELAY_MS - OOB_EXPLOSION_VISIBLE_MS) {
      state.outOfBoundsState = 'respawning';
    }
    if (prev > 0 && state.outOfBoundsRespawnMs <= 0) {
      this.respawnVehicleToSafePose(state);
    }
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
    const straightFast =
      !state.isOffTrack &&
      speedKmh > 96 &&
      !drifting &&
      state.slipRatio < 0.22 &&
      Math.abs(state.steerVisual) < 0.2;
    const comboLeveledUp = this.updateAutoCombo(state, dtSec, drifting, straightFast, speedKmh);
    if (comboLeveledUp) {
      return;
    }

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

  private updateAutoCombo(
    state: VehicleState,
    dtSec: number,
    drifting: boolean,
    straightFast: boolean,
    speedKmh: number,
  ): boolean {
    const dtMs = dtSec * 1000;
    const driftActive = drifting;
    const straightActive = straightFast;

    if (driftActive) {
      this.comboDriftMs = Math.min(3500, this.comboDriftMs + dtMs);
    } else {
      this.comboDriftMs = Math.max(0, this.comboDriftMs - dtMs * 1.8);
    }

    if (straightActive) {
      this.comboStraightMs = Math.min(5000, this.comboStraightMs + dtMs);
    } else {
      this.comboStraightMs = Math.max(0, this.comboStraightMs - dtMs * 1.5);
    }

    let gainMs = 0;
    if (driftActive && this.comboDriftMs > 240) {
      this.comboSource = 'drift';
      gainMs = dtMs * (1.08 + clamp(state.slipRatio, 0, 1.2) * 0.3);
    } else if (straightActive && this.comboStraightMs > 320) {
      this.comboSource = 'straight';
      gainMs = dtMs * (1 + clamp((speedKmh - 96) / 110, 0, 0.42));
    } else {
      const decay = state.isOffTrack || speedKmh < 60 ? dtMs * 2.35 : dtMs * 1.4;
      this.comboMeterMs = Math.max(0, this.comboMeterMs - decay);
      if (this.comboMeterMs <= 0 && this.comboLevel > 0) {
        this.comboLevel = Math.max(0, this.comboLevel - 1);
        this.comboMeterMs = this.comboLevel > 0 ? COMBO_STEP_MS * 0.62 : 0;
      }
      if (this.comboLevel === 0 && this.comboMeterMs === 0) {
        this.comboSource = 'none';
      }
      return false;
    }

    this.comboMeterMs += gainMs;
    if (this.comboMeterMs < COMBO_STEP_MS) {
      return false;
    }

    this.comboMeterMs -= COMBO_STEP_MS;
    this.comboLevel = Math.min(COMBO_MAX_LEVEL, this.comboLevel + 1);
    this.maxCombo = Math.max(this.maxCombo, this.comboLevel);
    const label = this.comboSource === 'drift' ? 'DRIFT' : 'STRAIGHT';
    this.setMessage(`${label} COMBO x${this.comboLevel}`, 720, 'hype');

    if (this.comboLevel >= COMBO_MAX_LEVEL) {
      this.comboMeterMs = COMBO_STEP_MS;
    }
    return true;
  }

  private breakCombo(reason: 'hit' | 'oob'): void {
    const maxCombo = this.comboLevel;
    if (maxCombo <= 0 && this.comboMeterMs <= 0) return;
    const maxSeen = this.maxCombo;
    this.resetComboState();
    this.maxCombo = Math.max(maxSeen, maxCombo);
    if (reason === 'hit' && maxCombo >= 2) {
      this.setMessage(`COMBO BREAK x${maxCombo}`, 760, 'warn');
    }
  }

  private resetComboState(): void {
    this.comboLevel = 0;
    this.maxCombo = 0;
    this.comboMeterMs = 0;
    this.comboSource = 'none';
    this.comboDriftMs = 0;
    this.comboStraightMs = 0;
  }

  private resetOverdriveState(): void {
    this.overdriveState = 'idle';
    this.overdriveMeter01 = 0;
    this.overdriveActiveMs = 0;
    this.overdrivePenaltyMs = 0;
    this.overdriveSpeedMultiplier = 1;
    this.overdriveAccelMultiplier = 1;
    this.overdriveBoostQueued = false;
    this.overdriveBoostWarnCooldownMs = 0;
  }

  private getPlayerRaceSpeedMultiplier(state: VehicleState): number {
    const overdriveMultiplier = this.getPlayerOverdriveSpeedMultiplier();
    if (overdriveMultiplier < 1) {
      return overdriveMultiplier;
    }
    return this.getPlayerComboSpeedMultiplier(state) * overdriveMultiplier;
  }

  private getPlayerComboSpeedMultiplier(state: VehicleState): number {
    if (!state.isPlayer) return 1;
    if (this.comboLevel <= 0) return 1;
    if (state.isOffTrack || state.outOfBoundsState !== 'none') return 1;

    const levelBonus = Math.min(0.12, this.comboLevel * 0.016);
    const sourceBonus = this.comboSource === 'drift' ? 0.018 : this.comboSource === 'straight' ? 0.01 : 0;
    const totalBonus = Math.min(0.16, levelBonus + sourceBonus);
    return 1 + totalBonus;
  }

  private getPlayerOverdriveSpeedMultiplier(): number {
    if (this.overdrivePenaltyMs > 0) return OVERDRIVE_PENALTY_SPEED_MULTIPLIER;
    if (this.overdriveState === 'active') return this.overdriveSpeedMultiplier;
    return 1;
  }

  private getPlayerOverdriveAccelMultiplier(): number {
    if (this.overdrivePenaltyMs > 0) return OVERDRIVE_PENALTY_ACCEL_MULTIPLIER;
    if (this.overdriveState === 'active') return this.overdriveAccelMultiplier;
    return 1;
  }

  private updateOverdriveRuntime(dtSec: number): void {
    const dtMs = dtSec * 1000;
    this.overdriveBoostWarnCooldownMs = Math.max(0, this.overdriveBoostWarnCooldownMs - dtMs);
    if (this.overdriveState === 'active') {
      this.overdriveActiveMs = Math.max(0, this.overdriveActiveMs - dtMs);
      if (this.overdriveActiveMs <= 0) {
        this.overdriveState = this.overdrivePenaltyMs > 0 ? 'overheated' : 'idle';
        this.overdriveSpeedMultiplier = 1;
        this.overdriveAccelMultiplier = 1;
      }
    }

    if (this.overdrivePenaltyMs > 0) {
      const prev = this.overdrivePenaltyMs;
      this.overdrivePenaltyMs = Math.max(0, this.overdrivePenaltyMs - dtMs);
      this.overdriveState = 'overheated';
      this.overdriveBoostQueued = false;
      if (prev > 0 && this.overdrivePenaltyMs <= 0) {
        this.overdriveState = 'idle';
        this.overdriveSpeedMultiplier = 1;
        this.overdriveAccelMultiplier = 1;
        this.setMessage('BOOST READY', 700, 'info');
      }
    }
  }

  private handlePlayerOverdriveInput(boostPressed: boolean, boostHeld: boolean): void {
    if (!boostHeld) {
      this.overdriveBoostQueued = false;
    }
    if (!boostPressed) return;
    if (this.tryActivateOverdrive()) {
      this.overdriveBoostQueued = false;
      return;
    }
    if (this.phase !== 'racing') return;
    if (this.overdriveState === 'active' || this.overdrivePenaltyMs > 0) {
      this.overdriveBoostQueued = false;
      return;
    }
    if (this.overdriveMeter01 < OVERDRIVE_MIN_METER) {
      this.showOverdriveChargeWarning();
      if (boostHeld) {
        this.overdriveBoostQueued = true;
      }
    }
  }

  private tryActivateQueuedOverdrive(boostHeld: boolean): void {
    if (!boostHeld) {
      this.overdriveBoostQueued = false;
      return;
    }
    if (!this.overdriveBoostQueued) return;
    if (this.tryActivateOverdrive()) {
      this.overdriveBoostQueued = false;
    }
  }

  private showOverdriveChargeWarning(): void {
    if (this.overdriveBoostWarnCooldownMs > 0) return;
    this.overdriveBoostWarnCooldownMs = OVERDRIVE_WARN_COOLDOWN_MS;
    this.setMessage('CHARGE不足', 700, 'warn');
  }

  private tryActivateOverdrive(): boolean {
    if (this.phase !== 'racing') return false;
    if (this.overdriveState === 'active') return false;
    if (this.overdrivePenaltyMs > 0) return false;
    if (this.overdriveMeter01 < OVERDRIVE_MIN_METER) return false;

    const spent = this.overdriveMeter01;
    this.overdriveMeter01 = 0;
    this.overdriveState = 'active';
    this.overdriveBoostQueued = false;
    this.overdriveActiveMs = OVERDRIVE_MIN_DURATION_MS + spent * (OVERDRIVE_MAX_DURATION_MS - OVERDRIVE_MIN_DURATION_MS);
    this.overdriveSpeedMultiplier =
      OVERDRIVE_MIN_SPEED_MULTIPLIER + spent * (OVERDRIVE_MAX_SPEED_MULTIPLIER - OVERDRIVE_MIN_SPEED_MULTIPLIER);
    this.overdriveAccelMultiplier =
      OVERDRIVE_MIN_ACCEL_MULTIPLIER + spent * (OVERDRIVE_MAX_ACCEL_MULTIPLIER - OVERDRIVE_MIN_ACCEL_MULTIPLIER);
    this.setMessage('OVERDRIVE!', 760, 'hype');
    this.options.eventBus.emit('race:overdriveStart', {
      atMs: this.elapsedMs,
      meterSpent: spent,
      durationMs: this.overdriveActiveMs,
    });
    return true;
  }

  private failOverdrive(reason: 'collision' | OutOfBoundsReason, showMessage = true): void {
    if (this.overdriveState !== 'active') return;
    this.overdriveState = 'overheated';
    this.overdriveActiveMs = 0;
    this.overdrivePenaltyMs = OVERDRIVE_PENALTY_MS;
    this.overdriveSpeedMultiplier = 1;
    this.overdriveAccelMultiplier = 1;
    this.overdriveMeter01 = 0;
    this.overdriveBoostQueued = false;
    this.breakCombo('hit');
    if (showMessage) {
      this.setMessage('OVERHEAT!', 820, 'warn');
    }
    this.options.eventBus.emit('race:overdriveFail', {
      atMs: this.elapsedMs,
      reason,
    });
  }

  private updateOverdriveMeter(state: VehicleState, sample: TrackSample, dtSec: number): void {
    if (!state.isPlayer) return;
    if (this.overdriveState === 'active' || this.overdrivePenaltyMs > 0) return;
    if (state.outOfBoundsState !== 'none') return;

    const speedKmh = Math.abs(state.speedForward) * 3.6;
    const drifting = speedKmh > 65 && (state.driftActive || state.slipRatio > 0.28);
    const wallRatio = sample.distance / Math.max(0.001, this.getPlayerWallLimit(sample));
    const wallRisk = wallRatio >= 0.82;

    let delta = 0;
    if (drifting) {
      delta += OVERDRIVE_DRIFT_GAIN_PER_SEC * dtSec;
    }
    if (wallRisk) {
      delta += OVERDRIVE_WALL_GAIN_PER_SEC * dtSec;
    }

    if (delta > 0) {
      this.overdriveMeter01 = clamp(this.overdriveMeter01 + delta, 0, 1);
      return;
    }

    this.overdriveMeter01 = Math.max(0, this.overdriveMeter01 - OVERDRIVE_IDLE_DECAY_PER_SEC * dtSec);
  }

  private addOverdriveMeter(amount01: number): void {
    if (this.overdriveState === 'active' || this.overdrivePenaltyMs > 0) return;
    this.overdriveMeter01 = clamp(this.overdriveMeter01 + amount01, 0, 1);
  }

  private updateCpuAdaptiveBias(): void {
    const player = this.getPlayerVehicle();
    const playerEntry = this.leaderboard.find((entry) => entry.isPlayer);
    if (!playerEntry) return;

    const total = this.leaderboard.length;
    const rankNorm = total <= 1 ? 0 : (playerEntry.rank - 1) / (total - 1);
    let target = 0;
    if (rankNorm <= 0.15) {
      target += 0.05;
    } else if (rankNorm >= 0.75) {
      target -= 0.045;
    }

    const leader = this.leaderboard[0];
    const playerProgress = player.progressMetric;
    const leaderProgress = leader?.progressMetric ?? playerProgress;
    const progressGap = leaderProgress - playerProgress;
    target += clamp(progressGap * -0.0045, -0.03, 0.03);
    target = clamp(target, -0.06, 0.08);
    this.cpuAdaptiveBias = clamp(this.cpuAdaptiveBias + (target - this.cpuAdaptiveBias) * 0.18, -0.06, 0.08);
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
      this.addOverdriveMeter(OVERDRIVE_OVERTAKE_BONUS);
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

  private getStartMessageByTheme(): string {
    switch (this.options.track.theme) {
      case 'raceway':
        return '高速レイアウト / 直線の伸びとブレーキング勝負';
      case 'desert':
        return '砂漠コース / 早めに向きを作って立ち上がれ';
      case 'forest':
        return 'テクニカル森林 / 小さく丁寧な切り返しが鍵';
      case 'studio':
        return 'トリッキースタジオ / リズム重視で攻めよう';
      case 'coastal':
      default:
        return '3ラップ / まずは1コーナーを丁寧に';
    }
  }
}

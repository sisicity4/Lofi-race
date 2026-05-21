import * as THREE from 'three';
import { AudioManager, type UiClickTone } from '../audio/AudioManager';
import { EventBus } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { DEFAULT_GAME_CONFIG, getVehicleParamsForTheme } from '../data/config';
import { SettingsStore } from '../data/SettingsStore';
import type { GameEvents } from '../game/GameState';
import { RaceManager } from '../game/RaceManager';
import { InputManager, type InputDebugState } from '../input/InputManager';
import { CameraRig } from '../render/CameraRig';
import { Renderer } from '../render/Renderer';
import { SceneBuilder } from '../render/SceneBuilder';
import { TrackLoader, type TrackCatalogEntry } from '../track/TrackLoader';
import { pickRandomTrackId } from '../track/randomTrack';
import type { GraphicsQuality, InputState, OutOfBoundsReason, RaceSnapshot, SettingsData, TrackDefinition } from '../types/game';
import { HudView } from '../ui/HudView';
import { MenuView } from '../ui/MenuView';
import { ResultView } from '../ui/ResultView';

const ZERO_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
  boostHeld: false,
  pause: false,
  mute: false,
};

interface TransientFx {
  root: THREE.Group;
  ageMs: number;
  lifeMs: number;
  update: (dtSec: number, ageMs: number, lifeMs: number) => void;
}

interface CarFxRefs {
  driftFxLeft?: THREE.Mesh;
  driftFxRight?: THREE.Mesh;
  driftFxMaterial?: THREE.MeshBasicMaterial;
  speedTrailLeft?: THREE.Mesh;
  speedTrailRight?: THREE.Mesh;
  speedTrailMaterial?: THREE.MeshBasicMaterial;
  rearGlow?: THREE.Mesh;
  rearGlowMaterial?: THREE.MeshBasicMaterial;
}

export class App {
  private readonly shell: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly uiLayer: HTMLDivElement;
  private readonly menuView: MenuView;
  private readonly hudView: HudView;
  private readonly resultView: ResultView;
  private readonly orientationGateEl: HTMLDivElement;
  private readonly orientationGateButton: HTMLButtonElement;
  private readonly orientationGateHint: HTMLParagraphElement;
  private readonly input = new InputManager();
  private readonly settingsStore = new SettingsStore();
  private readonly eventBus = new EventBus<GameEvents>();
  private readonly sceneBuilder = new SceneBuilder();
  private readonly trackLoader = new TrackLoader();
  private readonly trackCatalog: TrackCatalogEntry[];
  private readonly settings: SettingsData;
  private readonly audio: AudioManager;
  private readonly debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';

  private renderer: Renderer | null = null;
  private cameraRig: CameraRig | null = null;
  private loop: GameLoop | null = null;
  private raceManager: RaceManager | null = null;
  private track: TrackDefinition | null = null;
  private carMeshes = new Map<string, THREE.Group>();
  private nextCheckpointBeacon: THREE.Group | null = null;
  private activeFx: TransientFx[] = [];
  private shadowFlowGroups: THREE.Object3D[] = [];
  private shadowFlowTimeSec = 0;
  private cameraTrauma01 = 0;
  private lastSnapshot: RaceSnapshot | null = null;
  private debugEl: HTMLDivElement | null = null;
  private rafResizePending = false;
  private lastFeedbackKey = '';
  private lastInputWarningsKey = '';
  private lastInputDebug: InputDebugState | null = null;
  private inputGuideTouchMode: boolean | null = null;
  private lastMenuPortraitBlocked: boolean | null = null;
  private selectedTrackId: string;
  private menuTrackSelectionId: string;
  private raceStartInFlight = false;
  private trackChangeRequestSeq = 0;

  constructor(private readonly root: HTMLElement) {
    this.settings = this.settingsStore.load();
    this.trackCatalog = this.trackLoader.getTrackCatalog();
    this.selectedTrackId = this.pickRandomTrackId();
    this.menuTrackSelectionId = this.selectedTrackId;
    this.settings.trackId = this.selectedTrackId;
    this.input.setSteeringInverted(this.settings.invertSteer);
    this.audio = new AudioManager({ muted: this.settings.muted, masterVolume: this.settings.masterVolume });

    this.shell = document.createElement('div');
    this.shell.className = 'game-shell';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.uiLayer = document.createElement('div');
    this.uiLayer.className = 'ui-layer';
    this.shell.append(this.canvas, this.uiLayer);
    this.root.append(this.shell);

    this.menuView = new MenuView(this.uiLayer);
    this.hudView = new HudView(this.uiLayer, this.shell);
    this.resultView = new ResultView(this.uiLayer);

    this.orientationGateEl = document.createElement('div');
    this.orientationGateEl.className = 'orientation-gate hidden';
    this.orientationGateEl.innerHTML = `
      <div class="panel orientation-gate-card">
        <p class="eyebrow">PC BROWSER ONLY</p>
        <h2 class="orientation-gate-title">PCでプレイしてください</h2>
        <p class="orientation-gate-body">スマホ版の開発は一旦停止中です。キーボードで遊べるPCブラウザからアクセスしてください。</p>
        <div class="btn-row">
          <button id="orientationGateButton" class="btn primary">PCで開いて遊ぶ</button>
        </div>
        <p id="orientationGateHint" class="small orientation-gate-hint">この端末ではレース開始を無効化しています。</p>
      </div>
    `;
    this.uiLayer.append(this.orientationGateEl);
    this.orientationGateButton = this.orientationGateEl.querySelector('#orientationGateButton') as HTMLButtonElement;
    this.orientationGateHint = this.orientationGateEl.querySelector('#orientationGateHint') as HTMLParagraphElement;
    this.orientationGateButton.addEventListener('click', () => {
      this.playUiClick('secondary');
      this.menuView.setStatus('PCブラウザでアクセスしてください');
    });

    if (this.debugEnabled) {
      this.debugEl = document.createElement('div');
      this.debugEl.className = 'panel';
      this.debugEl.style.position = 'absolute';
      this.debugEl.style.left = '10px';
      this.debugEl.style.bottom = '10px';
      this.debugEl.style.padding = '8px 10px';
      this.debugEl.style.fontSize = '11px';
      this.debugEl.style.pointerEvents = 'none';
      this.debugEl.style.whiteSpace = 'pre-line';
      this.debugEl.style.maxWidth = '360px';
      this.uiLayer.append(this.debugEl);
    }

    this.bindViews();
    this.bindEvents();
    this.menuView.setLoading(true);
  }

  async mount(): Promise<void> {
    this.menuView.setSettings(this.settings);
    this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
    this.hudView.setSteerInverted(this.settings.invertSteer);
    this.syncInputGuideMode();
    this.hudView.setTouchEnabled(false);
    this.hudView.bindTouchControls(this.input);
    this.input.attach();
    this.refreshOrientationGuard();

    if (!Renderer.isWebGLAvailable(this.canvas)) {
      this.menuView.setError('WebGL が利用できません。');
      return;
    }

    this.menuView.setLoading(true);

    try {
      const initialTrack = await this.trackLoader.loadTrack(this.selectedTrackId);
      this.renderer = new Renderer(this.canvas);
      this.renderer.applyQuality(this.settings.graphicsQuality);
      this.renderer.resize();
      this.cameraRig = new CameraRig(this.renderer.camera);
      this.rebuildRaceForTrack(initialTrack);
      this.hudView.setVisible(false);
      this.menuView.setVisible(true);
      this.resultView.hide();
      this.audio.setPaused(true);
      this.audio.setStandbyLoopActive(true);

      this.loop = new GameLoop(DEFAULT_GAME_CONFIG.fixedStepHz, {
        fixedUpdate: (dtSec) => this.fixedUpdate(dtSec),
        render: (_alpha, frameDtSec) => this.render(frameDtSec),
      });
      this.loop.start();
    } catch (error) {
      console.error(error);
      this.menuView.setError('ゲーム初期化に失敗しました。ページ再読み込みを試してください。');
    } finally {
      this.menuView.setLoading(false);
    }
  }

  private bindViews(): void {
    this.menuView.bind({
      onStart: () => {
        this.playUiClick('primary');
        void this.handleStartRace();
      },
      onAssistLandscape: () => {
        this.playUiClick('secondary');
        void this.handleAssistLandscape();
      },
      onTrackChange: (trackId) => {
        this.playUiClick('secondary');
        void this.handleTrackChange(trackId);
      },
      onQualityChange: (quality) => {
        this.playUiClick('secondary');
        this.applyGraphicsQuality(quality);
      },
      onInvertSteerChange: (inverted) => {
        this.playUiClick('toggle');
        this.setInvertSteer(inverted);
      },
      onMuteToggle: () => {
        const wasMuted = this.audio.isMuted();
        if (!wasMuted) {
          this.playUiClick('toggle');
        }
        this.toggleMute();
        if (wasMuted) {
          this.playUiClick('toggle');
        }
      },
      onVolumeChange: (volume) => this.setMasterVolume(volume),
    });

    this.hudView.bind({
      onPauseButton: () => {
        this.playUiClick('secondary');
        this.raceManager?.togglePause();
      },
      onResumeButton: () => {
        this.playUiClick('primary');
        this.raceManager?.togglePause();
      },
      onTitleButton: () => {
        this.playUiClick('secondary');
        this.returnToTitle();
      },
    });

    this.resultView.bind({
      onRetry: () => {
        this.playUiClick('primary');
        void this.handleStartRace({ excludeCurrentTrack: true });
      },
      onBackToTitle: () => {
        this.playUiClick('secondary');
        this.returnToTitle();
      },
    });
  }

  private bindEvents(): void {
    this.eventBus.on('race:countdownTick', ({ label }) => {
      this.audio.playCountdown(label);
      if (label === 'GO') {
        this.hudView.flash('go');
      }
    });

    this.eventBus.on('race:start', () => {
      // GO sound is already emitted via countdown tick label to avoid double-triggering.
    });

    this.eventBus.on('race:overdriveStart', () => {
      this.audio.playOverdriveStart();
      this.hudView.flash('go');
      this.addCameraTrauma(0.38);
      const player = this.raceManager?.getPlayerVehicle();
      if (player) {
        this.spawnOverdriveBurstFx(player.position.x, player.position.y, player.position.z, player.yaw);
      }
    });

    this.eventBus.on('race:overdriveFail', () => {
      this.audio.playOverdriveFail();
      this.hudView.flash('warn');
      this.addCameraTrauma(0.28);
    });

    this.eventBus.on('car:collision', ({ a, b, impulse }) => {
      this.audio.playCollision(impulse);
      if ((a === 'player' || b === 'player') && impulse > 0.7) {
        this.hudView.flash('hit');
        this.addCameraTrauma(Math.min(0.32, impulse * 0.13));
      }
    });

    this.eventBus.on('car:oob', ({ vehicleId, x, y, z, reason }) => {
      if (vehicleId !== 'player') return;
      this.audio.playOutOfBoundsExplosion();
      this.hudView.flash('warn');
      this.addCameraTrauma(0.46);
      this.spawnOutOfBoundsFx(x, y, z, reason);
    });

    this.eventBus.on('car:respawned', ({ vehicleId, x, y, z }) => {
      if (vehicleId !== 'player') return;
      this.audio.playRespawnCue();
      this.hudView.flash('go');
      this.addCameraTrauma(0.18);
      this.spawnRespawnFx(x, y, z);
    });

    this.eventBus.on('race:lapComplete', ({ vehicleId }) => {
      if (vehicleId === 'player') {
        this.audio.playLapComplete();
        this.hudView.flash('lap');
        this.addCameraTrauma(0.2);
        const player = this.raceManager?.getPlayerVehicle();
        if (player) {
          this.spawnLapBurstFx(player.position.x, player.position.y, player.position.z);
        }
      }
    });

    this.eventBus.on('race:finish', ({ snapshot, vehicleId, finishOrder }) => {
      if (vehicleId === 'player') {
        this.audio.playFinish(finishOrder);
        this.hudView.flash('finish');
        this.lastSnapshot = snapshot;
      }
    });

    this.eventBus.on('ui:pauseToggled', ({ paused }) => {
      this.audio.setPaused(paused);
      this.hudView.setPaused(paused);
    });

    window.addEventListener('resize', () => {
      if (this.rafResizePending) return;
      this.rafResizePending = true;
      requestAnimationFrame(() => {
        this.rafResizePending = false;
        this.renderer?.resize();
        this.refreshOrientationGuard();
      });
    });

    window.addEventListener('orientationchange', () => {
      this.refreshOrientationGuard();
    });
  }

  private async handleStartRace(options: { excludeCurrentTrack?: boolean } = {}): Promise<void> {
    if (!this.raceManager || this.raceStartInFlight) return;
    if (this.isMobileUnsupported()) {
      this.refreshOrientationGuard();
      this.menuView.setStatus('PCブラウザでアクセスしてください');
      return;
    }
    // Invalidate any in-flight manual map switch to avoid menu/race state races.
    this.trackChangeRequestSeq += 1;
    this.raceStartInFlight = true;
    void this.audio.unlock().catch(() => {
      // Audio unlock failures must not block race start (notably on WebKit paths).
    });

    try {
      const nextTrackId = options.excludeCurrentTrack
        ? this.pickRandomTrackId(this.selectedTrackId)
        : this.trackLoader.resolveTrackId(this.menuTrackSelectionId);
      if (nextTrackId !== this.selectedTrackId) {
        this.menuView.setLoading(true);
        try {
          const nextTrack = await this.trackLoader.loadTrack(nextTrackId);
          this.clearTransientFx();
          this.rebuildRaceForTrack(nextTrack);
        } catch (error) {
          console.error(error);
          this.menuView.setStatus('ランダムコースの読み込みに失敗しました。現在のコースで開始します。');
        } finally {
          this.menuView.setLoading(false);
          this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
        }
      } else {
        this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
      }

      this.resultView.hide();
      this.menuView.setVisible(false);
      this.hudView.setVisible(true);
      this.hudView.setPaused(false);
      this.audio.setPaused(false);
      this.audio.setStandbyLoopActive(false);
      this.input.clearAll();
      this.clearTransientFx();
      this.cameraTrauma01 = 0;
      this.lastFeedbackKey = '';

      this.raceManager.startRace();
      this.lastSnapshot = this.raceManager.getSnapshot();
      this.hudView.update(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
    } finally {
      this.raceStartInFlight = false;
    }
  }

  private returnToTitle(): void {
    if (!this.raceManager) return;
    this.raceManager.returnToMenu();
    this.audio.setPaused(true);
    this.audio.setStandbyLoopActive(true);
    this.resultView.hide();
    this.hudView.setVisible(false);
    this.menuView.setVisible(true);
    this.input.clearAll();
    this.clearTransientFx();
    this.cameraTrauma01 = 0;
    this.lastFeedbackKey = '';
    this.lastSnapshot = this.raceManager.getSnapshot();
    this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
    this.refreshOrientationGuard();
  }

  private fixedUpdate(dtSec: number): void {
    if (!this.raceManager) return;

    this.refreshOrientationGuard();
    this.enforceMobilePortraitBlock();

    const mobileBlocked = this.isMobileUnsupported();
    const debugInputSnapshot = this.debugEnabled && !mobileBlocked ? this.input.peekSnapshot() : null;
    const input = mobileBlocked ? { ...ZERO_INPUT } : this.input.snapshot();
    if (this.debugEnabled && debugInputSnapshot) {
      this.updateInputDebug(this.input.getDebugState(debugInputSnapshot));
    } else if (this.debugEnabled) {
      this.lastInputDebug = null;
      this.lastInputWarningsKey = '';
    }
    if (input.mute) {
      this.toggleMute();
    }

    this.raceManager.update(dtSec, input);
    this.lastSnapshot = this.raceManager.getSnapshot();
    const phase = this.lastSnapshot.race.phase;
    const standbyPhase = phase === 'menu' || phase === 'paused' || phase === 'finished';
    this.audio.setStandbyLoopActive(standbyPhase);
    this.handleMomentFeedback(this.lastSnapshot);

    const player = this.raceManager.getPlayerVehicle();
    const active = phase === 'racing';
    this.audio.updateDrivingAudio(player.speedForward, player.slipRatio, active);

    if (this.settings.bestLapMs !== this.lastSnapshot.race.bestLapMs) {
      this.settings.bestLapMs = this.lastSnapshot.race.bestLapMs;
      this.persistSettings();
    }

    this.syncVehicleMeshes();

    if (this.lastSnapshot.race.phase === 'finished' && !this.resultView.isVisible()) {
      this.resultView.show(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
      if (this.isMobileUnsupported()) {
        this.hudView.setVisible(false);
        this.input.clearAll();
      }
    }
  }

  private rebuildRaceForTrack(track: TrackDefinition): void {
    if (!this.renderer) return;
    this.track = track;
    this.cameraTrauma01 = 0;
    this.selectedTrackId = this.trackLoader.resolveTrackId(track.id);
    this.menuTrackSelectionId = this.selectedTrackId;
    this.settings.trackId = this.selectedTrackId;

    this.sceneBuilder.buildScene(this.renderer.scene, track);
    this.collectShadowFlowGroups();
    this.createOrAttachNextCheckpointBeacon();

    this.raceManager = new RaceManager({
      track,
      config: DEFAULT_GAME_CONFIG,
      vehicleParams: getVehicleParamsForTheme(track.theme),
      eventBus: this.eventBus,
      initialBestLapMs: this.settings.bestLapMs,
    });

    this.createVehicleMeshes();
    this.syncVehicleMeshes();
    this.lastSnapshot = this.raceManager.getSnapshot();
    this.hudView.update(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
  }

  private async handleTrackChange(trackId: string): Promise<void> {
    const resolvedTrackId = this.trackLoader.resolveTrackId(trackId);
    this.menuTrackSelectionId = resolvedTrackId;
    this.menuView.setTrackOptions(this.trackCatalog, resolvedTrackId);

    if (resolvedTrackId === this.selectedTrackId) return;
    if (this.raceManager && this.raceManager.getPhase() !== 'menu') return;
    if (!this.renderer) return;
    const requestSeq = ++this.trackChangeRequestSeq;

    this.menuView.setLoading(true);
    try {
      const nextTrack = await this.trackLoader.loadTrack(resolvedTrackId);
      if (requestSeq !== this.trackChangeRequestSeq) {
        return;
      }
      if (!this.raceManager || this.raceManager.getPhase() !== 'menu' || this.raceStartInFlight) {
        return;
      }
      this.clearTransientFx();
      this.resultView.hide();
      this.hudView.setVisible(false);
      this.rebuildRaceForTrack(nextTrack);
      this.persistSettings();
    } catch (error) {
      if (requestSeq !== this.trackChangeRequestSeq) {
        return;
      }
      console.error(error);
      this.menuView.setStatus('マップの読み込みに失敗しました。');
      this.lastMenuPortraitBlocked = this.isMobileUnsupported();
      this.menuTrackSelectionId = this.selectedTrackId;
      this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
    } finally {
      if (requestSeq !== this.trackChangeRequestSeq) {
        return;
      }
      this.menuView.setLoading(false);
      this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
    }
  }

  private render(frameDtSec: number): void {
    if (!this.renderer || !this.raceManager || !this.cameraRig) return;

    const overdriveActive = this.lastSnapshot?.race.overdriveState === 'active';
    const overdriveIntensity = overdriveActive
      ? Math.max(0, Math.min(1, ((this.lastSnapshot?.race.overdriveSpeedMultiplier ?? 1) - 1) / 0.45))
      : 0;
    const player = this.raceManager.getPlayerVehicle();
    const speedKmh = Math.abs(player.speedForward) * 3.6;
    const driftFx01 = Math.max(
      0,
      Math.min(1, player.slipRatio * 0.75 + (player.driftBoostMs > 0 ? 0.32 + player.driftBoostStrength * 0.24 : 0)),
    );
    this.cameraTrauma01 = Math.max(0, this.cameraTrauma01 - frameDtSec * 1.35);
    this.cameraRig.update(player, frameDtSec, {
      active: overdriveActive,
      intensity01: overdriveIntensity,
      shake01: this.cameraTrauma01,
      speedFx01: Math.max(0, Math.min(1, speedKmh / 170)),
      driftFx01,
    });
    this.updateNextCheckpointBeacon(frameDtSec);
    this.updateShadowFlows(frameDtSec);
    this.updateTransientFx(frameDtSec);
    this.renderer.render();

    if (this.lastSnapshot) {
      this.hudView.update(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
      if (this.debugEl) {
        const p = this.raceManager.getPlayerVehicle();
        const lines = [
          `phase=${this.lastSnapshot.race.phase} speed=${(Math.abs(p.speedForward) * 3.6).toFixed(0)}km/h slip=${p.slipRatio.toFixed(2)} dpr=${this.renderer.getPixelRatio().toFixed(2)}`,
        ];
        if (this.lastInputDebug) {
          lines.push(`Input: ${this.lastInputDebug.pressedKeys.length > 0 ? this.lastInputDebug.pressedKeys.join(', ') : '(none)'}`);
          lines.push(`Touch: ${this.lastInputDebug.activeTouchActions.length > 0 ? this.lastInputDebug.activeTouchActions.join(', ') : '(none)'}`);
          lines.push(
            `State: T=${this.lastInputDebug.snapshot.throttle.toFixed(0)} B=${this.lastInputDebug.snapshot.brake.toFixed(0)} ` +
            `Steer=${this.lastInputDebug.snapshot.steer.toFixed(2)} Drift=${this.lastInputDebug.snapshot.handbrake ? 'ON' : 'OFF'} ` +
            `Boost=${this.lastInputDebug.snapshot.boost ? 'ON' : 'OFF'} Hold=${this.lastInputDebug.snapshot.boostHeld ? 'ON' : 'OFF'}`,
          );
          if (this.lastInputDebug.warnings.length > 0) {
            lines.push(`Warn: ${this.lastInputDebug.warnings.join(' | ')}`);
          }
        }
        this.debugEl.textContent = lines.join('\n');
      }
    }
  }

  private createVehicleMeshes(): void {
    if (!this.renderer || !this.raceManager) return;
    for (const mesh of this.carMeshes.values()) {
      this.renderer.scene.remove(mesh);
      this.disposeObjectResources(mesh);
    }
    this.carMeshes.clear();

    for (const vehicle of this.raceManager.getVehicles()) {
      const mesh = this.sceneBuilder.createCarMesh(vehicle.colorHex, vehicle.isPlayer);
      this.renderer.scene.add(mesh);
      this.carMeshes.set(vehicle.id, mesh);
    }
  }

  private createOrAttachNextCheckpointBeacon(): void {
    if (!this.renderer) return;
    if (this.nextCheckpointBeacon) {
      this.renderer.scene.remove(this.nextCheckpointBeacon);
    }

    const root = new THREE.Group();
    root.name = 'next-checkpoint-beacon';

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.16, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0x39e6d8, emissive: 0x082a2a, flatShading: true, roughness: 0.65 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    root.add(ring);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 5.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x7dfbe4, transparent: true, opacity: 0.32 }),
    );
    shaft.position.y = 2.75;
    root.add(shaft);

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.1, 5),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x3a2405, flatShading: true, roughness: 0.6 }),
    );
    head.position.y = 5.9;
    root.add(head);

    const cap = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.1, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0xfff3cb, flatShading: true, roughness: 0.75 }),
    );
    cap.rotation.x = Math.PI / 2;
    cap.position.y = 5.25;
    root.add(cap);

    (root.userData as { ring?: THREE.Mesh; head?: THREE.Mesh }).ring = ring;
    (root.userData as { ring?: THREE.Mesh; head?: THREE.Mesh }).head = head;
    root.visible = false;

    this.renderer.scene.add(root);
    this.nextCheckpointBeacon = root;
  }

  private updateNextCheckpointBeacon(frameDtSec: number): void {
    if (!this.nextCheckpointBeacon || !this.track || !this.raceManager || !this.lastSnapshot) return;
    const cps = this.track.checkpoints;
    if (cps.length === 0) {
      this.nextCheckpointBeacon.visible = false;
      return;
    }

    const player = this.lastSnapshot.vehicles.find((v) => v.isPlayer);
    if (!player) {
      this.nextCheckpointBeacon.visible = false;
      return;
    }

    const phase = this.lastSnapshot.race.phase;
    const showBeacon = phase === 'countdown' || phase === 'racing' || phase === 'paused';
    this.nextCheckpointBeacon.visible = showBeacon;
    if (!showBeacon) return;

    const nextIndex = player.finished ? 0 : (player.checkpointIndex + 1) % cps.length;
    const cp = cps[nextIndex];
    const t = performance.now() * 0.001;
    const pulse = 1 + Math.sin(t * 5.2) * 0.08;
    this.nextCheckpointBeacon.position.set(cp.x, 0, cp.z);
    this.nextCheckpointBeacon.rotation.y += frameDtSec * 1.8;
    this.nextCheckpointBeacon.scale.set(pulse, 1, pulse);

    const bob = Math.sin(t * 4.3) * 0.22;
    const head = (this.nextCheckpointBeacon.userData as { head?: THREE.Mesh }).head;
    const ring = (this.nextCheckpointBeacon.userData as { ring?: THREE.Mesh }).ring;
    if (head) {
      head.position.y = 5.9 + bob;
    }
    if (ring) {
      ring.position.y = 0.3 + Math.sin(t * 3.1) * 0.03;
    }
  }

  private syncVehicleMeshes(): void {
    if (!this.raceManager) return;
    const nowMs = performance.now();
    const racePhase = this.lastSnapshot?.race.phase ?? this.raceManager.getPhase();
    const raceFxEnabled = racePhase === 'racing';
    for (const vehicle of this.raceManager.getVehicles()) {
      const mesh = this.carMeshes.get(vehicle.id);
      if (!mesh) continue;
      mesh.visible = vehicle.outOfBoundsState === 'none';
      if (!mesh.visible) {
        continue;
      }
      mesh.position.set(vehicle.position.x, vehicle.position.y, vehicle.position.z);
      mesh.rotation.y = vehicle.yaw;
      const body = mesh.children[0];
      if (body) {
        body.rotation.z = -vehicle.steerVisual * 0.02;
      }

      const fxRefs = mesh.userData as CarFxRefs;
      const driftFxLeft = fxRefs.driftFxLeft;
      const driftFxRight = fxRefs.driftFxRight;
      const driftFxMaterial = fxRefs.driftFxMaterial;
      if (!driftFxLeft || !driftFxRight || !driftFxMaterial) {
        continue;
      }

      const speedKmh = Math.abs(vehicle.speedForward) * 3.6;
      const drifting = !vehicle.isOffTrack && speedKmh > 32 && (vehicle.driftActive || vehicle.slipRatio > 0.24);
      const boosting = vehicle.driftBoostMs > 0;
      const showDriftFx = raceFxEnabled && (drifting || boosting);

      if (!showDriftFx) {
        driftFxLeft.visible = false;
        driftFxRight.visible = false;
        driftFxMaterial.opacity = 0;
      } else {
        const intensityRaw = vehicle.slipRatio * 0.85 + (boosting ? 0.52 + vehicle.driftBoostStrength * 0.48 : 0);
        const intensity = Math.max(0, Math.min(1.4, intensityRaw));
        const widthScale = 0.8 + intensity * 0.28;
        const lengthScale = 0.75 + intensity * 1.05;
        const pulse = 0.9 + Math.sin(nowMs * 0.012 + vehicle.position.x * 0.08 + vehicle.position.z * 0.08) * 0.1;
        const opacity = Math.min(0.62, (0.09 + intensity * 0.3) * pulse);
        const steerOffset = vehicle.steerVisual * 0.14;

        driftFxLeft.visible = true;
        driftFxRight.visible = true;
        driftFxLeft.scale.set(widthScale, 1, lengthScale);
        driftFxRight.scale.set(widthScale, 1, lengthScale);
        driftFxLeft.rotation.y = -0.08 + steerOffset;
        driftFxRight.rotation.y = 0.08 + steerOffset;
        driftFxMaterial.color.setHex(boosting ? 0x9df7ff : 0x4bd9ff);
        driftFxMaterial.opacity = opacity;
      }

      const speedTrailLeft = fxRefs.speedTrailLeft;
      const speedTrailRight = fxRefs.speedTrailRight;
      const speedTrailMaterial = fxRefs.speedTrailMaterial;
      const rearGlow = fxRefs.rearGlow;
      const rearGlowMaterial = fxRefs.rearGlowMaterial;
      if (!speedTrailLeft || !speedTrailRight || !speedTrailMaterial || !rearGlow || !rearGlowMaterial) {
        continue;
      }

      const overdriveActive = vehicle.isPlayer && this.lastSnapshot?.race.overdriveState === 'active';
      const overdriveIntensity = overdriveActive
        ? Math.max(0, Math.min(1, ((this.lastSnapshot?.race.overdriveSpeedMultiplier ?? 1) - 1) / 0.45))
        : 0;
      const highSpeed01 = Math.max(0, Math.min(1, (speedKmh - 92) / 86));
      const trailIntensity = Math.max(
        vehicle.isPlayer ? highSpeed01 : highSpeed01 * 0.45,
        vehicle.isPlayer && boosting ? 0.34 + vehicle.driftBoostStrength * 0.34 : 0,
        overdriveActive ? 0.48 + overdriveIntensity * 0.42 : 0,
      );

      if (!raceFxEnabled || trailIntensity <= 0.02) {
        speedTrailLeft.visible = false;
        speedTrailRight.visible = false;
        speedTrailMaterial.opacity = 0;
        rearGlow.visible = false;
        rearGlowMaterial.opacity = 0;
        continue;
      }

      const trailPulse = 0.86 + Math.sin(nowMs * 0.018 + vehicle.position.x * 0.03) * 0.14;
      const trailLength = 0.7 + trailIntensity * (overdriveActive ? 2.2 : 1.35);
      const trailWidth = 0.78 + trailIntensity * 0.38;
      speedTrailLeft.visible = true;
      speedTrailRight.visible = true;
      speedTrailLeft.scale.set(trailWidth, 1, trailLength);
      speedTrailRight.scale.set(trailWidth, 1, trailLength);
      speedTrailLeft.rotation.y = -0.04 + vehicle.steerVisual * 0.1;
      speedTrailRight.rotation.y = 0.04 + vehicle.steerVisual * 0.1;
      speedTrailMaterial.color.setHex(overdriveActive ? 0x7dedff : boosting ? 0xffd166 : 0x9df7ff);
      speedTrailMaterial.opacity = Math.min(0.68, (0.08 + trailIntensity * 0.32) * trailPulse);

      const glowIntensity = vehicle.isPlayer
        ? Math.max(highSpeed01 * 0.34, boosting ? 0.42 : 0, overdriveActive ? 0.52 + overdriveIntensity * 0.3 : 0)
        : highSpeed01 * 0.18;
      rearGlow.visible = glowIntensity > 0.03;
      rearGlow.scale.set(1 + glowIntensity * 0.35, 1 + glowIntensity * 0.7, 1);
      rearGlowMaterial.color.setHex(overdriveActive ? 0x7dfbff : boosting ? 0xffd166 : 0x7dfbe4);
      rearGlowMaterial.opacity = Math.min(0.58, glowIntensity * 0.46);
    }
  }

  private addCameraTrauma(amount01: number): void {
    this.cameraTrauma01 = Math.max(0, Math.min(1, this.cameraTrauma01 + amount01));
  }

  private spawnLapBurstFx(x: number, y: number, z: number): void {
    if (!this.renderer) return;
    const root = new THREE.Group();
    root.position.set(x, y + 0.08, z);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.46, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);

    const sparkMat = new THREE.MeshBasicMaterial({ color: 0x7dffb3, transparent: true, opacity: 0.72, depthWrite: false });
    const sparkGeom = new THREE.BoxGeometry(0.16, 0.16, 0.72);
    const sparks: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; spin: number }> = [];
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2;
      const mesh = new THREE.Mesh(sparkGeom, sparkMat);
      mesh.position.set(Math.cos(angle) * 0.55, 0.24 + (i % 3) * 0.08, Math.sin(angle) * 0.55);
      mesh.rotation.y = angle;
      root.add(mesh);
      sparks.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * (3.8 + (i % 4) * 0.28), 1.1 + (i % 5) * 0.14, Math.sin(angle) * (3.8 + (i % 4) * 0.28)),
        spin: (i % 2 === 0 ? 1 : -1) * (4.2 + i * 0.08),
      });
    }

    this.renderer.scene.add(root);
    this.activeFx.push({
      root,
      ageMs: 0,
      lifeMs: 620,
      update: (dtSec, ageMs, lifeMs) => {
        const t = Math.min(1, ageMs / lifeMs);
        ring.scale.setScalar(1 + t * 3.4);
        ring.position.y = 0.02 + t * 0.28;
        ringMat.opacity = Math.max(0, 0.68 - t * 0.86);
        for (const spark of sparks) {
          spark.mesh.position.x += spark.vel.x * dtSec;
          spark.mesh.position.y += spark.vel.y * dtSec;
          spark.mesh.position.z += spark.vel.z * dtSec;
          spark.vel.y -= 3.4 * dtSec;
          spark.mesh.rotation.y += spark.spin * dtSec;
          spark.mesh.scale.setScalar(1 - t * 0.42);
        }
        sparkMat.opacity = Math.max(0, 0.72 - t * 0.82);
      },
    });
  }

  private spawnOverdriveBurstFx(x: number, y: number, z: number, yaw: number): void {
    if (!this.renderer) return;
    const root = new THREE.Group();
    root.position.set(x, y + 0.1, z);
    root.rotation.y = yaw;

    const shockMat = new THREE.MeshBasicMaterial({ color: 0x7dedff, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
    const shock = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.38, 34), shockMat);
    shock.rotation.x = -Math.PI / 2;
    root.add(shock);

    const streakMat = new THREE.MeshBasicMaterial({
      color: 0x9df7ff,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const streakGeom = new THREE.BoxGeometry(0.12, 0.1, 4.2);
    const streaks: THREE.Mesh[] = [];
    for (const xOffset of [-1.6, -0.85, -0.28, 0.28, 0.85, 1.6] as const) {
      const streak = new THREE.Mesh(streakGeom, streakMat);
      streak.position.set(xOffset, 0.52 + Math.abs(xOffset) * 0.08, -2.7 - Math.abs(xOffset) * 0.35);
      streak.renderOrder = 11;
      root.add(streak);
      streaks.push(streak);
    }

    this.renderer.scene.add(root);
    this.activeFx.push({
      root,
      ageMs: 0,
      lifeMs: 540,
      update: (_dtSec, ageMs, lifeMs) => {
        const t = Math.min(1, ageMs / lifeMs);
        shock.scale.setScalar(1 + t * 4.7);
        shockMat.opacity = Math.max(0, 0.72 - t * 0.92);
        streakMat.opacity = Math.max(0, 0.52 - t * 0.62);
        for (let i = 0; i < streaks.length; i += 1) {
          const streak = streaks[i];
          streak.position.z = -2.7 - t * (7.5 + i * 0.32);
          streak.scale.z = 1 + t * 1.8;
          streak.scale.x = Math.max(0.25, 1 - t * 0.5);
        }
      },
    });
  }

  private spawnOutOfBoundsFx(x: number, y: number, z: number, reason: OutOfBoundsReason): void {
    if (!this.renderer) return;
    const root = new THREE.Group();
    root.position.set(x, y + 0.4, z);

    const shardGeom = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    const shardMat = new THREE.MeshStandardMaterial({
      color: reason === 'wall-contact' ? 0xff7a59 : 0xffb347,
      emissive: reason === 'wall-contact' ? 0x441206 : 0x3a2208,
      flatShading: true,
      roughness: 0.75,
    });
    const shards: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 }> = [];
    for (let i = 0; i < 11; i += 1) {
      const mesh = new THREE.Mesh(shardGeom, shardMat);
      const angle = (i / 11) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const outward = 4 + Math.random() * 4.2;
      mesh.position.set((Math.random() - 0.5) * 0.3, Math.random() * 0.35, (Math.random() - 0.5) * 0.3);
      root.add(mesh);
      shards.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * outward, 2.2 + Math.random() * 2.2, Math.sin(angle) * outward),
        spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
      });
    }

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.18, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    root.add(ring);

    const puffMat = new THREE.MeshBasicMaterial({ color: 0x2e2a2a, transparent: true, opacity: 0.36 });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), puffMat);
    puff.position.y = 0.5;
    root.add(puff);

    this.renderer.scene.add(root);
    this.activeFx.push({
      root,
      ageMs: 0,
      lifeMs: 900,
      update: (dtSec, ageMs, lifeMs) => {
        const t = Math.min(1, ageMs / lifeMs);
        for (const shard of shards) {
          shard.mesh.position.x += shard.vel.x * dtSec;
          shard.mesh.position.y += shard.vel.y * dtSec;
          shard.mesh.position.z += shard.vel.z * dtSec;
          shard.vel.y -= 7.5 * dtSec;
          shard.mesh.rotation.x += shard.spin.x * dtSec;
          shard.mesh.rotation.y += shard.spin.y * dtSec;
          shard.mesh.rotation.z += shard.spin.z * dtSec;
          const fade = Math.max(0, 1 - t * 1.15);
          (shard.mesh.material as THREE.MeshStandardMaterial).opacity = fade;
          (shard.mesh.material as THREE.MeshStandardMaterial).transparent = true;
        }
        ring.scale.setScalar(1 + t * 2.3);
        ring.position.y = 0.06 + t * 0.15;
        ringMat.opacity = Math.max(0, 0.65 - t * 0.9);
        puff.scale.setScalar(1 + t * 2.7);
        puff.position.y = 0.5 + t * 0.9;
        puffMat.opacity = Math.max(0, 0.36 - t * 0.4);
      },
    });
  }

  private spawnRespawnFx(x: number, y: number, z: number): void {
    if (!this.renderer) return;
    const root = new THREE.Group();
    root.position.set(x, y + 0.02, z);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7cfce0, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.98, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);

    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xb6fff6, transparent: true, opacity: 0.24 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 2.4, 8), pillarMat);
    pillar.position.y = 1.2;
    root.add(pillar);

    this.renderer.scene.add(root);
    this.activeFx.push({
      root,
      ageMs: 0,
      lifeMs: 550,
      update: (_dtSec, ageMs, lifeMs) => {
        const t = Math.min(1, ageMs / lifeMs);
        ring.scale.setScalar(1 + t * 2.8);
        ringMat.opacity = Math.max(0, 0.72 - t * 0.9);
        pillar.scale.set(1 - t * 0.35, 1 + t * 0.25, 1 - t * 0.35);
        pillar.position.y = 1.2 + t * 0.35;
        pillarMat.opacity = Math.max(0, 0.24 - t * 0.3);
      },
    });
  }

  private updateTransientFx(frameDtSec: number): void {
    if (!this.renderer || this.activeFx.length === 0) return;
    for (let i = this.activeFx.length - 1; i >= 0; i -= 1) {
      const fx = this.activeFx[i];
      fx.ageMs += frameDtSec * 1000;
      fx.update(frameDtSec, fx.ageMs, fx.lifeMs);
      if (fx.ageMs < fx.lifeMs) continue;
      this.renderer.scene.remove(fx.root);
      this.disposeObjectResources(fx.root);
      this.activeFx.splice(i, 1);
    }
  }

  private disposeObjectResources(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else {
        material?.dispose?.();
      }
    });
  }

  private clearTransientFx(): void {
    if (!this.renderer || this.activeFx.length === 0) return;
    for (const fx of this.activeFx) {
      this.renderer.scene.remove(fx.root);
      this.disposeObjectResources(fx.root);
    }
    this.activeFx = [];
  }

  private collectShadowFlowGroups(): void {
    if (!this.renderer) {
      this.shadowFlowGroups = [];
      this.shadowFlowTimeSec = 0;
      return;
    }

    this.shadowFlowGroups = [];
    this.renderer.scene.traverse((object) => {
      const data = object.userData as { shadowFlow?: boolean };
      if (data.shadowFlow) {
        this.shadowFlowGroups.push(object);
      }
    });
    this.shadowFlowTimeSec = 0;
  }

  private updateShadowFlows(frameDtSec: number): void {
    if (this.shadowFlowGroups.length === 0) return;
    this.shadowFlowTimeSec += frameDtSec;

    for (const group of this.shadowFlowGroups) {
      const flow = group.userData as {
        span?: number;
        speed?: number;
        spacing?: number;
      };
      const span = Math.max(1, flow.span ?? 60);
      const speed = flow.speed ?? 22;
      const spacing = flow.spacing ?? 6;

      for (let i = 0; i < group.children.length; i += 1) {
        const child = group.children[i];
        const baseOffset = (child.userData as { baseOffset?: number }).baseOffset ?? i * spacing;
        const raw = baseOffset + this.shadowFlowTimeSec * speed;
        const wrapped = ((raw % span) + span) % span;
        child.position.z = wrapped - span * 0.5;
      }
    }
  }

  private applyGraphicsQuality(quality: GraphicsQuality): void {
    this.settings.graphicsQuality = quality;
    this.renderer?.applyQuality(quality);
    this.persistSettings();
    this.eventBus.emit('settings:changed', {
      graphicsQuality: this.settings.graphicsQuality,
      muted: this.settings.muted,
      masterVolume: this.settings.masterVolume,
      invertSteer: this.settings.invertSteer,
    });
  }

  private setInvertSteer(inverted: boolean): void {
    this.settings.invertSteer = inverted;
    this.input.setSteeringInverted(inverted);
    this.menuView.setSettings(this.settings);
    this.hudView.setSteerInverted(inverted);
    this.persistSettings();
    this.eventBus.emit('settings:changed', {
      graphicsQuality: this.settings.graphicsQuality,
      muted: this.settings.muted,
      masterVolume: this.settings.masterVolume,
      invertSteer: this.settings.invertSteer,
    });
  }

  private toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    this.menuView.setSettings(this.settings);
    this.persistSettings();
    this.eventBus.emit('settings:changed', {
      graphicsQuality: this.settings.graphicsQuality,
      muted: this.settings.muted,
      masterVolume: this.settings.masterVolume,
      invertSteer: this.settings.invertSteer,
    });
  }

  private setMasterVolume(volume: number): void {
    this.settings.masterVolume = volume;
    this.audio.setMasterVolume(volume);
    this.persistSettings();
    this.eventBus.emit('settings:changed', {
      graphicsQuality: this.settings.graphicsQuality,
      muted: this.settings.muted,
      masterVolume: this.settings.masterVolume,
      invertSteer: this.settings.invertSteer,
    });
  }

  private persistSettings(): void {
    this.settingsStore.save({ ...this.settings });
  }

  private pickRandomTrackId(excludeId?: string): string {
    return pickRandomTrackId(
      this.trackCatalog.map((track) => track.id),
      { excludeId },
    );
  }

  private getMenuReadyStatus(): string {
    return '表示中コースで開始します（初回表示はランダム）';
  }

  private handleMomentFeedback(snapshot: RaceSnapshot): void {
    const key = `${snapshot.messageTone}:${snapshot.message ?? ''}:${snapshot.race.phase}`;
    if (key === this.lastFeedbackKey) return;
    this.lastFeedbackKey = key;
    if (!snapshot.message) return;

    if (snapshot.messageTone === 'hype' && snapshot.message.includes('オーバーテイク')) {
      this.audio.playMoment('overtake');
      this.hudView.flash('overtake');
      return;
    }

    if (snapshot.messageTone === 'warn' && (snapshot.message.includes('後退') || snapshot.message.includes('芝'))) {
      this.audio.playMoment('warn');
      this.hudView.flash('warn');
    }
  }

  private isMobileUnsupported(): boolean {
    return this.shouldUseMobileTouchUI();
  }

  private refreshOrientationGuard(): void {
    this.syncInputGuideMode();
    const mobileUnsupported = this.isMobileUnsupported();
    const phase = this.raceManager?.getPhase() ?? 'menu';
    const showOrientationGate = mobileUnsupported;

    this.orientationGateEl.classList.toggle('hidden', !showOrientationGate);
    this.shell.classList.toggle('orientation-blocked', showOrientationGate);
    this.hudView.setTouchEnabled(false);

    if (phase === 'menu') {
      this.menuView.setLandscapeAssistVisible(false);
      this.menuView.setPortraitStartBlocked(mobileUnsupported);
      if (this.lastMenuPortraitBlocked !== mobileUnsupported) {
        this.menuView.setStatus(mobileUnsupported ? 'スマホではプレイできません。PCブラウザでアクセスしてください。' : this.getMenuReadyStatus());
        this.lastMenuPortraitBlocked = mobileUnsupported;
      }
    } else {
      this.lastMenuPortraitBlocked = null;
    }

    this.orientationGateHint.textContent = showOrientationGate
      ? 'この端末ではレース開始を無効化しています。'
      : '';
  }

  private enforceMobilePortraitBlock(): void {
    if (!this.isMobileUnsupported() || !this.raceManager) return;
    if (this.raceManager.getPhase() !== 'menu') {
      this.raceManager.returnToMenu();
      this.audio.setPaused(true);
      this.audio.setStandbyLoopActive(true);
      this.resultView.hide();
      this.hudView.setVisible(false);
      this.menuView.setVisible(true);
      this.input.clearAll();
    }
  }

  private async handleAssistLandscape(): Promise<void> {
    this.menuView.setStatus('PCブラウザでアクセスしてください');
  }

  private getTrackLabel(trackId: string): string {
    return this.trackCatalog.find((track) => track.id === trackId)?.label ?? trackId;
  }

  private playUiClick(tone: UiClickTone): void {
    this.audio.playUiClick(tone);
  }

  private shouldUseMobileTouchUI(): boolean {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const noHover = matchMedia('(hover: none)').matches;
    const hasTouch = navigator.maxTouchPoints > 0;
    return coarse || (hasTouch && noHover);
  }

  private syncInputGuideMode(): void {
    const touchMode = false;
    if (this.inputGuideTouchMode === touchMode) return;
    this.inputGuideTouchMode = touchMode;
    this.menuView.setInputGuideMode(touchMode ? 'touch' : 'keyboard');
    this.hudView.setInputGuideMode(touchMode ? 'touch' : 'keyboard');
  }

  private updateInputDebug(state: InputDebugState): void {
    this.lastInputDebug = state;
    const key = state.warnings.join('|');
    if (!key) {
      this.lastInputWarningsKey = '';
      return;
    }
    if (key === this.lastInputWarningsKey) return;
    this.lastInputWarningsKey = key;
    console.warn('[InputDebug] UI説明と入力状態の不一致を検出:', state.warnings);
  }
}

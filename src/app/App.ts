import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { EventBus } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { DEFAULT_GAME_CONFIG, DEFAULT_VEHICLE_PARAMS } from '../data/config';
import { SettingsStore } from '../data/SettingsStore';
import type { GameEvents } from '../game/GameState';
import { RaceManager } from '../game/RaceManager';
import { InputManager } from '../input/InputManager';
import { CameraRig } from '../render/CameraRig';
import { Renderer } from '../render/Renderer';
import { SceneBuilder } from '../render/SceneBuilder';
import { TrackLoader } from '../track/TrackLoader';
import type { GraphicsQuality, InputState, RaceSnapshot, SettingsData } from '../types/game';
import { HudView } from '../ui/HudView';
import { MenuView } from '../ui/MenuView';
import { ResultView } from '../ui/ResultView';

const ZERO_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
  pause: false,
  mute: false,
};

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
  private readonly settings: SettingsData;
  private readonly audio: AudioManager;
  private readonly debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';

  private renderer: Renderer | null = null;
  private cameraRig: CameraRig | null = null;
  private loop: GameLoop | null = null;
  private raceManager: RaceManager | null = null;
  private carMeshes = new Map<string, THREE.Group>();
  private lastSnapshot: RaceSnapshot | null = null;
  private debugEl: HTMLDivElement | null = null;
  private rafResizePending = false;
  private lastFeedbackKey = '';
  private portraitPauseApplied = false;

  constructor(private readonly root: HTMLElement) {
    this.settings = this.settingsStore.load();
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
        <p class="eyebrow">LANDSCAPE ONLY</p>
        <h2 class="orientation-gate-title">横画面でプレイしてください</h2>
        <p class="orientation-gate-body">縦画面では操作を無効化しています。端末を横向きにしてください。</p>
        <div class="btn-row">
          <button id="orientationGateButton" class="btn primary">横画面を試す</button>
        </div>
        <p id="orientationGateHint" class="small orientation-gate-hint">対応端末では横画面ロックを試行します。</p>
      </div>
    `;
    this.uiLayer.append(this.orientationGateEl);
    this.orientationGateButton = this.orientationGateEl.querySelector('#orientationGateButton') as HTMLButtonElement;
    this.orientationGateHint = this.orientationGateEl.querySelector('#orientationGateHint') as HTMLParagraphElement;
    this.orientationGateButton.addEventListener('click', () => {
      void this.tryForceLandscape(true);
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
      this.uiLayer.append(this.debugEl);
    }

    this.bindViews();
    this.bindEvents();
  }

  async mount(): Promise<void> {
    this.menuView.setSettings(this.settings);
    this.hudView.setTouchEnabled(this.shouldUseMobileTouchUI());
    this.hudView.bindTouchControls(this.input);
    this.input.attach();
    this.refreshOrientationGuard();
    void this.tryForceLandscape(false);

    if (!Renderer.isWebGLAvailable(this.canvas)) {
      this.menuView.setError('WebGL が利用できません。');
      return;
    }

    this.menuView.setLoading(true);

    try {
      const track = await this.trackLoader.loadDefaultTrack();
      this.renderer = new Renderer(this.canvas);
      this.renderer.applyQuality(this.settings.graphicsQuality);
      this.renderer.resize();
      this.cameraRig = new CameraRig(this.renderer.camera);

      this.sceneBuilder.buildScene(this.renderer.scene, track);

      this.raceManager = new RaceManager({
        track,
        config: DEFAULT_GAME_CONFIG,
        vehicleParams: DEFAULT_VEHICLE_PARAMS,
        eventBus: this.eventBus,
        initialBestLapMs: this.settings.bestLapMs,
      });

      this.createVehicleMeshes();
      this.syncVehicleMeshes();
      this.lastSnapshot = this.raceManager.getSnapshot();
      this.hudView.update(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
      this.hudView.setVisible(false);
      this.menuView.setVisible(true);
      this.resultView.hide();

      this.loop = new GameLoop(DEFAULT_GAME_CONFIG.fixedStepHz, {
        fixedUpdate: (dtSec) => this.fixedUpdate(dtSec),
        render: (_alpha, frameDtSec) => this.render(frameDtSec),
      });
      this.loop.start();
      this.menuView.setStatus('準備完了。レース開始でプレイできます。');
    } catch (error) {
      console.error(error);
      this.menuView.setError('ゲーム初期化に失敗しました。ページ再読み込みを試してください。');
    } finally {
      this.menuView.setLoading(false);
    }
  }

  private bindViews(): void {
    this.menuView.bind({
      onStart: () => this.handleStartRace(),
      onQualityChange: (quality) => this.applyGraphicsQuality(quality),
      onMuteToggle: () => this.toggleMute(),
      onVolumeChange: (volume) => this.setMasterVolume(volume),
    });

    this.hudView.bind({
      onPauseButton: () => this.raceManager?.togglePause(),
      onResumeButton: () => this.raceManager?.togglePause(),
      onTitleButton: () => this.returnToTitle(),
    });

    this.resultView.bind({
      onRetry: () => this.handleStartRace(true),
      onBackToTitle: () => this.returnToTitle(),
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

    this.eventBus.on('car:collision', ({ a, b, impulse }) => {
      this.audio.playCollision(impulse);
      if ((a === 'player' || b === 'player') && impulse > 0.7) {
        this.hudView.flash('hit');
      }
    });

    this.eventBus.on('race:lapComplete', ({ vehicleId }) => {
      if (vehicleId === 'player') {
        this.audio.playLapComplete();
        this.hudView.flash('lap');
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
      void this.tryForceLandscape(false);
    });
  }

  private async handleStartRace(fromRetry = false): Promise<void> {
    if (!this.raceManager) return;
    await this.tryForceLandscape(true);
    await this.audio.unlock();

    this.resultView.hide();
    this.menuView.setVisible(false);
    this.hudView.setVisible(true);
    this.hudView.setPaused(false);
    this.input.clearAll();
    this.lastFeedbackKey = '';
    this.portraitPauseApplied = false;

    if (fromRetry) {
      this.raceManager.restartRace();
    } else {
      this.raceManager.startRace();
    }

    this.lastSnapshot = this.raceManager.getSnapshot();
    this.hudView.update(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
  }

  private returnToTitle(): void {
    if (!this.raceManager) return;
    this.raceManager.returnToMenu();
    this.resultView.hide();
    this.hudView.setVisible(false);
    this.menuView.setVisible(true);
    this.menuView.setStatus('タイトルに戻りました。');
    this.input.clearAll();
    this.lastFeedbackKey = '';
    this.portraitPauseApplied = false;
    this.lastSnapshot = this.raceManager.getSnapshot();
    this.refreshOrientationGuard();
  }

  private fixedUpdate(dtSec: number): void {
    if (!this.raceManager) return;

    this.refreshOrientationGuard();
    this.enforceMobilePortraitBlock();

    const input = this.isPortraitBlockedOnTouchDevice() ? { ...ZERO_INPUT } : this.input.snapshot();
    if (input.mute) {
      this.toggleMute();
    }

    this.raceManager.update(dtSec, input);
    this.lastSnapshot = this.raceManager.getSnapshot();
    this.handleMomentFeedback(this.lastSnapshot);

    const player = this.raceManager.getPlayerVehicle();
    const active = this.lastSnapshot.race.phase === 'racing';
    this.audio.updateDrivingAudio(player.speedForward, player.slipRatio, active);

    if (this.settings.bestLapMs !== this.lastSnapshot.race.bestLapMs) {
      this.settings.bestLapMs = this.lastSnapshot.race.bestLapMs;
      this.persistSettings();
    }

    this.syncVehicleMeshes();

    if (this.lastSnapshot.race.phase === 'finished' && !this.resultView.isVisible()) {
      this.resultView.show(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
    }
  }

  private render(frameDtSec: number): void {
    if (!this.renderer || !this.raceManager || !this.cameraRig) return;

    this.cameraRig.update(this.raceManager.getPlayerVehicle(), frameDtSec);
    this.renderer.render();

    if (this.lastSnapshot) {
      this.hudView.update(this.lastSnapshot, DEFAULT_GAME_CONFIG.laps);
      if (this.debugEl) {
        const p = this.raceManager.getPlayerVehicle();
        this.debugEl.textContent = `phase=${this.lastSnapshot.race.phase} speed=${(Math.abs(p.speedForward) * 3.6).toFixed(0)}km/h slip=${p.slipRatio.toFixed(2)} dpr=${this.renderer.getPixelRatio().toFixed(2)}`;
      }
    }
  }

  private createVehicleMeshes(): void {
    if (!this.renderer || !this.raceManager) return;
    for (const mesh of this.carMeshes.values()) {
      this.renderer.scene.remove(mesh);
    }
    this.carMeshes.clear();

    for (const vehicle of this.raceManager.getVehicles()) {
      const mesh = this.sceneBuilder.createCarMesh(vehicle.colorHex, vehicle.isPlayer);
      this.renderer.scene.add(mesh);
      this.carMeshes.set(vehicle.id, mesh);
    }
  }

  private syncVehicleMeshes(): void {
    if (!this.raceManager) return;
    for (const vehicle of this.raceManager.getVehicles()) {
      const mesh = this.carMeshes.get(vehicle.id);
      if (!mesh) continue;
      mesh.position.set(vehicle.position.x, vehicle.position.y, vehicle.position.z);
      mesh.rotation.y = vehicle.yaw;
      const body = mesh.children[0];
      if (body) {
        body.rotation.z = -vehicle.steerVisual * 0.02;
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
    });
  }

  private persistSettings(): void {
    this.settingsStore.save({ ...this.settings });
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

  private isPortraitBlockedOnTouchDevice(): boolean {
    return this.shouldUseMobileTouchUI() && window.innerHeight > window.innerWidth;
  }

  private refreshOrientationGuard(): void {
    const blocked = this.isPortraitBlockedOnTouchDevice();
    this.orientationGateEl.classList.toggle('hidden', !blocked);
    this.shell.classList.toggle('orientation-blocked', blocked);
    this.hudView.setTouchEnabled(this.shouldUseMobileTouchUI() && !blocked);
    if (!blocked) {
      this.orientationGateHint.textContent = '対応端末では横画面ロックを試行します。';
    }
  }

  private enforceMobilePortraitBlock(): void {
    if (!this.raceManager) return;
    const blocked = this.isPortraitBlockedOnTouchDevice();
    const phase = this.raceManager.getPhase();

    if (blocked) {
      this.input.clearAll();
      if ((phase === 'racing' || phase === 'countdown') && !this.portraitPauseApplied) {
        this.raceManager.togglePause();
        this.portraitPauseApplied = true;
      }
      return;
    }

    if (this.portraitPauseApplied && phase === 'paused') {
      this.raceManager.togglePause();
    }
    this.portraitPauseApplied = false;
  }

  private async tryForceLandscape(fromUserGesture: boolean): Promise<void> {
    if (!this.shouldUseMobileTouchUI()) return;

    const orientationApi = (typeof screen !== 'undefined'
      ? (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })
      : undefined);
    const lockOrientation = orientationApi?.lock;
    const supportsOrientationLock =
      Boolean(orientationApi) &&
      typeof lockOrientation === 'function';

    if (fromUserGesture && this.isPortraitBlockedOnTouchDevice() && document.fullscreenElement == null) {
      try {
        await this.shell.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        // Fullscreen is optional for orientation lock.
      }
    }

    if (!supportsOrientationLock) {
      this.orientationGateHint.textContent = 'このブラウザは自動横画面ロックに未対応です。端末を横向きにしてください。';
      this.refreshOrientationGuard();
      return;
    }

    try {
      if (this.isPortraitBlockedOnTouchDevice()) {
        await lockOrientation?.call(orientationApi, 'landscape');
      }
      this.orientationGateHint.textContent = '横画面ロックを試行しました。反映されない場合は端末を横向きにしてください。';
    } catch {
      this.orientationGateHint.textContent = '自動横画面ロックに失敗しました。端末を横向きにしてください。';
    } finally {
      this.refreshOrientationGuard();
    }
  }

  private shouldUseMobileTouchUI(): boolean {
    if (!this.input.isTouchLikely()) return false;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const smallViewport = Math.max(window.innerWidth, window.innerHeight) <= 1200;
    return coarse || smallViewport;
  }
}

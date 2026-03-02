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
import { TrackLoader, type TrackCatalogEntry } from '../track/TrackLoader';
import type { GraphicsQuality, InputState, OutOfBoundsReason, RaceSnapshot, SettingsData, TrackDefinition } from '../types/game';
import { HudView } from '../ui/HudView';
import { MenuView } from '../ui/MenuView';
import { ResultView } from '../ui/ResultView';

const ZERO_INPUT: InputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  pause: false,
  mute: false,
};

interface TransientFx {
  root: THREE.Group;
  ageMs: number;
  lifeMs: number;
  update: (dtSec: number, ageMs: number, lifeMs: number) => void;
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
  private lastSnapshot: RaceSnapshot | null = null;
  private debugEl: HTMLDivElement | null = null;
  private rafResizePending = false;
  private lastFeedbackKey = '';
  private portraitPauseApplied = false;
  private selectedTrackId: string;

  constructor(private readonly root: HTMLElement) {
    this.settings = this.settingsStore.load();
    this.trackCatalog = this.trackLoader.getTrackCatalog();
    this.selectedTrackId = this.trackLoader.resolveTrackId(this.settings.trackId);
    this.settings.trackId = this.selectedTrackId;
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
    this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
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
      const initialTrack = await this.trackLoader.loadTrack(this.selectedTrackId);
      this.renderer = new Renderer(this.canvas);
      this.renderer.applyQuality(this.settings.graphicsQuality);
      this.renderer.resize();
      this.cameraRig = new CameraRig(this.renderer.camera);
      this.rebuildRaceForTrack(initialTrack);
      this.hudView.setVisible(false);
      this.menuView.setVisible(true);
      this.resultView.hide();

      this.loop = new GameLoop(DEFAULT_GAME_CONFIG.fixedStepHz, {
        fixedUpdate: (dtSec) => this.fixedUpdate(dtSec),
        render: (_alpha, frameDtSec) => this.render(frameDtSec),
      });
      this.loop.start();
      this.menuView.setStatus(`準備完了。${this.getTrackLabel(this.selectedTrackId)} でプレイできます。`);
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
      onTrackChange: (trackId) => {
        void this.handleTrackChange(trackId);
      },
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

    this.eventBus.on('car:oob', ({ vehicleId, x, y, z, reason }) => {
      if (vehicleId !== 'player') return;
      this.audio.playOutOfBoundsExplosion();
      this.hudView.flash('warn');
      this.spawnOutOfBoundsFx(x, y, z, reason);
    });

    this.eventBus.on('car:respawned', ({ vehicleId, x, y, z }) => {
      if (vehicleId !== 'player') return;
      this.audio.playRespawnCue();
      this.hudView.flash('go');
      this.spawnRespawnFx(x, y, z);
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
    this.audio.setPaused(false);
    this.input.clearAll();
    this.clearTransientFx();
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
    this.audio.setPaused(false);
    this.resultView.hide();
    this.hudView.setVisible(false);
    this.menuView.setVisible(true);
    this.menuView.setStatus('タイトルに戻りました。');
    this.input.clearAll();
    this.clearTransientFx();
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
      if (this.shouldUseMobileTouchUI()) {
        this.hudView.setVisible(false);
        this.input.clearAll();
      }
    }
  }

  private rebuildRaceForTrack(track: TrackDefinition): void {
    if (!this.renderer) return;
    this.track = track;
    this.selectedTrackId = this.trackLoader.resolveTrackId(track.id);
    this.settings.trackId = this.selectedTrackId;

    this.sceneBuilder.buildScene(this.renderer.scene, track);
    this.createOrAttachNextCheckpointBeacon();

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
  }

  private async handleTrackChange(trackId: string): Promise<void> {
    const resolvedTrackId = this.trackLoader.resolveTrackId(trackId);
    this.menuView.setTrackOptions(this.trackCatalog, resolvedTrackId);

    if (resolvedTrackId === this.selectedTrackId) return;
    if (this.raceManager && this.raceManager.getPhase() !== 'menu') return;
    if (!this.renderer) return;

    this.menuView.setLoading(true);
    try {
      const nextTrack = await this.trackLoader.loadTrack(resolvedTrackId);
      this.clearTransientFx();
      this.resultView.hide();
      this.hudView.setVisible(false);
      this.rebuildRaceForTrack(nextTrack);
      this.persistSettings();
      this.menuView.setStatus(`${this.getTrackLabel(this.selectedTrackId)} を選択中`);
    } catch (error) {
      console.error(error);
      this.menuView.setStatus('マップの読み込みに失敗しました。');
      this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
    } finally {
      this.menuView.setLoading(false);
      this.menuView.setTrackOptions(this.trackCatalog, this.selectedTrackId);
    }
  }

  private render(frameDtSec: number): void {
    if (!this.renderer || !this.raceManager || !this.cameraRig) return;

    this.cameraRig.update(this.raceManager.getPlayerVehicle(), frameDtSec);
    this.updateNextCheckpointBeacon(frameDtSec);
    this.updateTransientFx(frameDtSec);
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
    }
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

  private getTrackLabel(trackId: string): string {
    return this.trackCatalog.find((track) => track.id === trackId)?.label ?? trackId;
  }

  private shouldUseMobileTouchUI(): boolean {
    if (!this.input.isTouchLikely()) return false;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const smallViewport = Math.max(window.innerWidth, window.innerHeight) <= 1200;
    return coarse || smallViewport;
  }
}

import type { GraphicsQuality, SettingsData } from '../types/game';
import type { TrackCatalogEntry } from '../track/TrackLoader';
import { buildDesktopControlGuideRows } from '../input/bindings';

interface MenuCallbacks {
  onStart: () => void;
  onTrackChange: (trackId: string) => void;
  onQualityChange: (quality: GraphicsQuality) => void;
  onInvertSteerChange: (inverted: boolean) => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
}

export class MenuView {
  readonly root: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private readonly trackSelect: HTMLSelectElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly invertSteerButton: HTMLButtonElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly controlPills: HTMLDivElement;
  private callbacks: Partial<MenuCallbacks> = {};
  private loading = false;
  private portraitStartBlocked = false;
  private deviceBlocked = false;
  private steerInverted = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'center-overlay';
    this.root.innerHTML = `
      <div class="panel center-card menu-card">
        <div class="menu-hero">
          <h1 class="title-mark">WEB RACING</h1>
          <p class="title-sub">3LAP ARCADE RACE</p>
        </div>

        <div class="menu-cta-wrap">
          <button id="startButton" class="btn primary menu-start-btn">レース開始</button>
          <p id="menuSubtitle" class="small menu-substatus">準備OK</p>
        </div>

        <div id="menuControlPills" class="control-pills" aria-label="操作の要点"></div>

        <div class="panel menu-settings">
          <div class="menu-settings-head">
            <div class="small">設定</div>
            <button id="muteButton" class="btn ghost menu-inline-btn">音: ON</button>
          </div>
          <label class="small menu-setting-row">
            <span>マップ</span>
            <select id="trackSelect" class="btn menu-select"></select>
          </label>
          <label class="small menu-setting-row">
            <span>画質</span>
            <select id="qualitySelect" class="btn menu-select">
              <option value="auto">Auto</option>
              <option value="low">Low</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          <label class="small menu-setting-row">
            <span>左右操作</span>
            <button id="invertSteerButton" class="btn ghost menu-inline-btn menu-toggle-btn" type="button">反転: ON</button>
          </label>
          <label class="small menu-setting-row volume-row">
            <span>音量</span>
            <input id="volumeInput" type="range" min="0" max="1" step="0.01" />
          </label>
        </div>
      </div>
    `;

    parent.append(this.root);

    this.startButton = this.root.querySelector('#startButton') as HTMLButtonElement;
    this.trackSelect = this.root.querySelector('#trackSelect') as HTMLSelectElement;
    this.qualitySelect = this.root.querySelector('#qualitySelect') as HTMLSelectElement;
    this.invertSteerButton = this.root.querySelector('#invertSteerButton') as HTMLButtonElement;
    this.muteButton = this.root.querySelector('#muteButton') as HTMLButtonElement;
    this.volumeInput = this.root.querySelector('#volumeInput') as HTMLInputElement;
    this.subtitle = this.root.querySelector('#menuSubtitle') as HTMLParagraphElement;
    this.controlPills = this.root.querySelector('#menuControlPills') as HTMLDivElement;

    this.startButton.addEventListener('click', () => this.callbacks.onStart?.());
    this.trackSelect.addEventListener('change', () => this.callbacks.onTrackChange?.(this.trackSelect.value));
    this.qualitySelect.addEventListener('change', () => {
      this.callbacks.onQualityChange?.(this.qualitySelect.value as GraphicsQuality);
    });
    this.invertSteerButton.addEventListener('click', () => {
      this.steerInverted = !this.steerInverted;
      this.syncInvertSteerButton();
      this.renderControlPills();
      this.callbacks.onInvertSteerChange?.(this.steerInverted);
    });
    this.muteButton.addEventListener('click', () => this.callbacks.onMuteToggle?.());
    this.volumeInput.addEventListener('input', () => this.callbacks.onVolumeChange?.(Number(this.volumeInput.value)));
    this.renderControlPills();
  }

  bind(callbacks: MenuCallbacks): void {
    this.callbacks = callbacks;
  }

  setSettings(settings: SettingsData): void {
    this.qualitySelect.value = settings.graphicsQuality;
    this.steerInverted = settings.invertSteer;
    this.syncInvertSteerButton();
    this.renderControlPills();
    this.volumeInput.value = String(settings.masterVolume);
    this.muteButton.textContent = settings.muted ? '音: OFF' : '音: ON';
  }

  setTrackOptions(tracks: TrackCatalogEntry[], selectedTrackId: string): void {
    this.trackSelect.innerHTML = '';
    for (const track of tracks) {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = track.label;
      this.trackSelect.append(option);
    }
    this.trackSelect.value = tracks.some((track) => track.id === selectedTrackId)
      ? selectedTrackId
      : (tracks[0]?.id ?? '');
    this.syncDisabledState();
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
    this.syncDisabledState();
  }

  setDeviceBlocked(blocked: boolean): void {
    if (this.deviceBlocked === blocked) return;
    this.deviceBlocked = blocked;
    this.root.classList.toggle('device-blocked', blocked);
    this.syncDisabledState();
  }

  private syncDisabledState(): void {
    this.syncStartButtonState();
    const disabled = this.loading || this.deviceBlocked;
    this.trackSelect.disabled = disabled || this.trackSelect.options.length <= 1;
    this.qualitySelect.disabled = disabled;
    this.invertSteerButton.disabled = disabled;
    this.muteButton.disabled = disabled;
    this.volumeInput.disabled = disabled;
  }

  setPortraitStartBlocked(blocked: boolean): void {
    this.portraitStartBlocked = blocked;
    this.syncStartButtonState();
  }

  setError(message: string): void {
    this.root.textContent = '';
    const card = document.createElement('div');
    card.className = 'panel center-card error-card';

    const title = document.createElement('h2');
    title.style.marginTop = '0';
    title.textContent = '起動できませんでした';

    const body = document.createElement('p');
    body.textContent = message;

    const hint = document.createElement('p');
    hint.className = 'small';
    hint.textContent = 'WebGL対応ブラウザ（Chrome / Firefox / Safari）を確認してください。';

    card.append(title, body, hint);
    this.root.append(card);
  }

  setStatus(message: string): void {
    this.subtitle.textContent = message;
  }

  private syncStartButtonState(): void {
    this.startButton.disabled = this.loading || this.portraitStartBlocked || this.deviceBlocked;
    this.startButton.textContent = this.loading
      ? '読み込み中...'
      : this.portraitStartBlocked || this.deviceBlocked
        ? 'PCでプレイしてください'
        : 'レース開始';
  }

  private renderControlPills(): void {
    const rows = buildDesktopControlGuideRows();

    this.controlPills.textContent = '';
    for (const row of rows) {
      const pill = document.createElement('div');
      pill.className = 'control-pill';
      pill.textContent = `${row.keyText} ${row.actionText}`;
      this.controlPills.append(pill);
    }
  }

  private syncInvertSteerButton(): void {
    this.invertSteerButton.textContent = this.steerInverted ? '反転: ON' : '反転: OFF';
  }
}

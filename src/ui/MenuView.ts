import type { GraphicsQuality, SettingsData } from '../types/game';
import type { TrackCatalogEntry } from '../track/TrackLoader';

interface MenuCallbacks {
  onStart: () => void;
  onTrackChange: (trackId: string) => void;
  onQualityChange: (quality: GraphicsQuality) => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
}

export class MenuView {
  readonly root: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
  private readonly trackSelect: HTMLSelectElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly subtitle: HTMLParagraphElement;
  private callbacks: Partial<MenuCallbacks> = {};

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

        <div class="control-pills" aria-label="操作の要点">
          <div class="control-pill">加速 / 減速</div>
          <div class="control-pill">左右ステア</div>
          <div class="control-pill">ドリフト</div>
        </div>

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
    this.muteButton = this.root.querySelector('#muteButton') as HTMLButtonElement;
    this.volumeInput = this.root.querySelector('#volumeInput') as HTMLInputElement;
    this.subtitle = this.root.querySelector('#menuSubtitle') as HTMLParagraphElement;

    this.startButton.addEventListener('click', () => this.callbacks.onStart?.());
    this.trackSelect.addEventListener('change', () => this.callbacks.onTrackChange?.(this.trackSelect.value));
    this.qualitySelect.addEventListener('change', () => {
      this.callbacks.onQualityChange?.(this.qualitySelect.value as GraphicsQuality);
    });
    this.muteButton.addEventListener('click', () => this.callbacks.onMuteToggle?.());
    this.volumeInput.addEventListener('input', () => this.callbacks.onVolumeChange?.(Number(this.volumeInput.value)));
  }

  bind(callbacks: MenuCallbacks): void {
    this.callbacks = callbacks;
  }

  setSettings(settings: SettingsData): void {
    this.qualitySelect.value = settings.graphicsQuality;
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
    this.trackSelect.disabled = tracks.length <= 1;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setLoading(loading: boolean): void {
    this.startButton.disabled = loading;
    this.trackSelect.disabled = loading || this.trackSelect.options.length <= 1;
    this.qualitySelect.disabled = loading;
    this.muteButton.disabled = loading;
    this.volumeInput.disabled = loading;
    this.startButton.textContent = loading ? '読み込み中...' : 'レース開始';
  }

  setError(message: string): void {
    this.root.innerHTML = `
      <div class="panel center-card error-card">
        <h2 style="margin-top:0;">起動できませんでした</h2>
        <p>${message}</p>
        <p class="small">WebGL対応ブラウザ（Chrome / Firefox / Safari）を確認してください。</p>
      </div>
    `;
  }

  setStatus(message: string): void {
    this.subtitle.textContent = message;
  }
}

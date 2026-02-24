import type { GraphicsQuality, SettingsData } from '../types/game';

interface MenuCallbacks {
  onStart: () => void;
  onQualityChange: (quality: GraphicsQuality) => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
}

export class MenuView {
  readonly root: HTMLDivElement;
  private readonly startButton: HTMLButtonElement;
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
          <p class="eyebrow">LOW-POLY COASTAL GRAND PRIX</p>
          <h1 class="title-mark">WEB RACING</h1>
          <p class="title-sub">CPU 3台と3ラップ。速さより、まずはコーナーをきれいに抜ける。</p>
        </div>

        <div class="control-pills" aria-label="操作の要点">
          <div class="control-pill"><span>1</span> アクセル / ブレーキ</div>
          <div class="control-pill"><span>2</span> 左右で曲がる</div>
          <div class="control-pill"><span>3</span> Driftで向きを作る</div>
        </div>

        <div class="controls-note">
          <div><strong>Desktop:</strong> WASD / 矢印, Space=Drift, R=Reset, Esc=Pause</div>
          <div><strong>Mobile:</strong> タッチボタン操作（横画面推奨）</div>
        </div>

        <div class="panel menu-settings">
          <div class="small" style="margin-bottom:8px;">設定</div>
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

        <div class="btn-row menu-actions">
          <button id="startButton" class="btn primary">レース開始</button>
          <button id="muteButton" class="btn ghost">ミュート切替</button>
        </div>
        <p id="menuSubtitle" class="small menu-substatus">初回タップ/クリックで音声を有効化します。</p>
      </div>
    `;

    parent.append(this.root);

    this.startButton = this.root.querySelector('#startButton') as HTMLButtonElement;
    this.qualitySelect = this.root.querySelector('#qualitySelect') as HTMLSelectElement;
    this.muteButton = this.root.querySelector('#muteButton') as HTMLButtonElement;
    this.volumeInput = this.root.querySelector('#volumeInput') as HTMLInputElement;
    this.subtitle = this.root.querySelector('#menuSubtitle') as HTMLParagraphElement;

    this.startButton.addEventListener('click', () => this.callbacks.onStart?.());
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
    this.muteButton.textContent = settings.muted ? 'ミュート解除' : 'ミュート切替';
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setLoading(loading: boolean): void {
    this.startButton.disabled = loading;
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

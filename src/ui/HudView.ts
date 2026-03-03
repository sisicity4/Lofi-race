import { formatMs } from '../core/math';
import type { RaceSnapshot } from '../types/game';
import type { InputManager, TouchAction } from '../input/InputManager';

interface HudCallbacks {
  onPauseButton: () => void;
  onResumeButton: () => void;
  onTitleButton: () => void;
}

type FlashKind = 'go' | 'lap' | 'hit' | 'finish' | 'overtake' | 'warn';

export class HudView {
  readonly root: HTMLDivElement;
  private readonly speedValue: HTMLDivElement;
  private readonly rankValue: HTMLDivElement;
  private readonly lapValue: HTMLDivElement;
  private readonly timeValue: HTMLDivElement;
  private readonly bestValue: HTMLDivElement;
  private readonly leaderboardList: HTMLOListElement;
  private readonly countdownEl: HTMLDivElement;
  private readonly messageEl: HTMLDivElement;
  private readonly pausePanel: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly portraitOverlay: HTMLDivElement;
  private readonly touchControls: HTMLDivElement;
  private readonly mobileBanner: HTMLDivElement;
  private readonly speedDialEl: HTMLDivElement;
  private readonly overdriveHudEl: HTMLDivElement;
  private readonly overdriveStateEl: HTMLSpanElement;
  private readonly overdriveFillEl: HTMLSpanElement;
  private readonly comboBadgeEl: HTMLDivElement;
  private readonly comboValueEl: HTMLSpanElement;
  private readonly comboFillEl: HTMLSpanElement;
  private readonly driftBadgeEl: HTMLDivElement;
  private readonly driftLinesEl: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private readonly touchSteerZone: HTMLDivElement | null;
  private readonly touchSteerThumb: HTMLDivElement | null;
  private readonly touchButtons = new Map<TouchAction, HTMLButtonElement>();
  private callbacks: Partial<HudCallbacks> = {};
  private lastShownFinish = false;
  private lastCountdownLabel: string | null = null;
  private lastPlayerRank: number | null = null;
  private lastLeaderboardKey = '';
  private flashTimer: number | null = null;

  constructor(parent: HTMLElement, private readonly shell: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    this.root.innerHTML = `
      <div class="hud-focus panel">
        <div class="hud-focus-top">
          <div>
            <div class="mini-label">順位</div>
            <div class="focus-rank" id="hudRank">-</div>
          </div>
          <div class="lap-stack">
            <div class="mini-label">Lap</div>
            <div class="lap-main" id="hudLap">0 / 3</div>
          </div>
        </div>
        <div class="hud-focus-grid">
          <div class="stat-block">
            <div class="mini-label">現在</div>
            <div class="stat-value" id="hudTime">0:00.00</div>
          </div>
          <div class="stat-block">
            <div class="mini-label">ベスト</div>
            <div class="stat-value" id="hudBest">--</div>
          </div>
        </div>
      </div>

      <div class="hud-side">
        <button id="pauseBtn" class="btn ghost icon-btn" aria-label="pause">II</button>
        <section class="leaderboard panel">
          <h3>FIELD</h3>
          <ol id="hudLeaderboard"></ol>
        </section>
      </div>

      <section class="hud-keybinds panel" aria-label="controls">
        <h3>KEYS</h3>
        <ul class="keybind-list">
          <li><span class="kb-key">W / ↑</span><span class="kb-desc">アクセル</span></li>
          <li><span class="kb-key">S / ↓</span><span class="kb-desc">ブレーキ</span></li>
          <li><span class="kb-key">A D / ← →</span><span class="kb-desc">ステア</span></li>
          <li><span class="kb-key">Space</span><span class="kb-desc">ドリフト</span></li>
          <li><span class="kb-key">Esc / M</span><span class="kb-desc">ポーズ / ミュート</span></li>
        </ul>
      </section>

      <div class="speed-dial panel" id="speedDial">
        <div class="mini-label">SPEED</div>
        <div class="speed-value" id="hudSpeed">0</div>
        <div class="speed-unit">km/h</div>
      </div>
      <div class="overdrive-hud panel" id="overdriveHud" data-state="idle">
        <div class="overdrive-head">
          <span class="mini-label">OD</span>
          <span id="overdriveState">CHARGE</span>
        </div>
        <div class="overdrive-meter"><span id="overdriveFill"></span></div>
      </div>
      <div id="comboBadge" class="combo-badge hidden" data-source="none">
        <div class="combo-head"><span>COMBO</span><span id="comboValue">x0</span></div>
        <div class="combo-meter"><span id="comboFill"></span></div>
      </div>

      <div id="driftBadge" class="drift-badge hidden">DRIFT</div>
      <div id="countdownEl" class="countdown"></div>
      <div id="messageEl" class="message-banner hidden"></div>
      <div id="driftLines" class="drift-lines"></div>
      <div id="flashEl" class="hud-flash"></div>

      <div id="touchControls" class="touch-controls"></div>
      <div id="mobileBanner" class="mobile-banner hidden">モバイル対応 / 横画面推奨 / タッチ操作</div>
      <div id="portraitOverlay" class="portrait-overlay hidden">横画面にするとコーナーが見やすくなります</div>

      <div id="pausePanel" class="center-overlay hidden">
        <div class="panel center-card">
          <p class="eyebrow">PAUSED</p>
          <h2 style="margin-top:0; margin-bottom:8px;">ポーズ</h2>
          <p class="small">一息ついて、次のコーナーで取り返そう。</p>
          <div class="btn-row">
            <button id="resumeBtn" class="btn primary">再開</button>
            <button id="pauseTitleBtn" class="btn">タイトルへ戻る</button>
          </div>
        </div>
      </div>
    `;
    parent.append(this.root);

    this.speedValue = this.root.querySelector('#hudSpeed') as HTMLDivElement;
    this.rankValue = this.root.querySelector('#hudRank') as HTMLDivElement;
    this.lapValue = this.root.querySelector('#hudLap') as HTMLDivElement;
    this.timeValue = this.root.querySelector('#hudTime') as HTMLDivElement;
    this.bestValue = this.root.querySelector('#hudBest') as HTMLDivElement;
    this.leaderboardList = this.root.querySelector('#hudLeaderboard') as HTMLOListElement;
    this.countdownEl = this.root.querySelector('#countdownEl') as HTMLDivElement;
    this.messageEl = this.root.querySelector('#messageEl') as HTMLDivElement;
    this.pausePanel = this.root.querySelector('#pausePanel') as HTMLDivElement;
    this.pauseBtn = this.root.querySelector('#pauseBtn') as HTMLButtonElement;
    this.portraitOverlay = this.root.querySelector('#portraitOverlay') as HTMLDivElement;
    this.touchControls = this.root.querySelector('#touchControls') as HTMLDivElement;
    this.mobileBanner = this.root.querySelector('#mobileBanner') as HTMLDivElement;
    this.speedDialEl = this.root.querySelector('#speedDial') as HTMLDivElement;
    this.overdriveHudEl = this.root.querySelector('#overdriveHud') as HTMLDivElement;
    this.overdriveStateEl = this.root.querySelector('#overdriveState') as HTMLSpanElement;
    this.overdriveFillEl = this.root.querySelector('#overdriveFill') as HTMLSpanElement;
    this.comboBadgeEl = this.root.querySelector('#comboBadge') as HTMLDivElement;
    this.comboValueEl = this.root.querySelector('#comboValue') as HTMLSpanElement;
    this.comboFillEl = this.root.querySelector('#comboFill') as HTMLSpanElement;
    this.driftBadgeEl = this.root.querySelector('#driftBadge') as HTMLDivElement;
    this.driftLinesEl = this.root.querySelector('#driftLines') as HTMLDivElement;
    this.flashEl = this.root.querySelector('#flashEl') as HTMLDivElement;

    this.buildTouchControls();
    this.touchSteerZone = this.root.querySelector('#touchSteerZone');
    this.touchSteerThumb = this.root.querySelector('#touchSteerThumb');

    const resumeBtn = this.root.querySelector('#resumeBtn') as HTMLButtonElement;
    const pauseTitleBtn = this.root.querySelector('#pauseTitleBtn') as HTMLButtonElement;
    this.pauseBtn.addEventListener('click', () => this.callbacks.onPauseButton?.());
    resumeBtn.addEventListener('click', () => this.callbacks.onResumeButton?.());
    pauseTitleBtn.addEventListener('click', () => this.callbacks.onTitleButton?.());

    this.refreshOrientation();
    window.addEventListener('resize', () => this.refreshOrientation());
    if (screen.orientation) {
      screen.orientation.addEventListener?.('change', () => this.refreshOrientation());
    }
  }

  bind(callbacks: HudCallbacks): void {
    this.callbacks = callbacks;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) {
      this.setPaused(false);
      this.countdownEl.classList.remove('visible', 'pulse');
      this.messageEl.classList.add('hidden');
      this.clearFlash();
      this.lastShownFinish = false;
      this.lastCountdownLabel = null;
      this.lastPlayerRank = null;
      this.lastLeaderboardKey = '';
      this.leaderboardList.textContent = '';
      this.root.classList.remove('is-fast', 'is-drifting', 'is-boosting');
      this.driftBadgeEl.textContent = 'DRIFT';
      this.comboBadgeEl.classList.add('hidden');
      this.comboValueEl.textContent = 'x0';
      this.comboFillEl.style.transform = 'scaleX(0)';
      this.comboBadgeEl.dataset.source = 'none';
      this.overdriveHudEl.dataset.state = 'idle';
      this.overdriveStateEl.textContent = 'CHARGE';
      this.overdriveFillEl.style.transform = 'scaleX(0)';
    }
  }

  setPaused(paused: boolean): void {
    this.pausePanel.classList.toggle('hidden', !paused);
    this.pauseBtn.textContent = paused ? '▶' : 'II';
  }

  setTouchEnabled(enabled: boolean): void {
    this.touchControls.classList.toggle('hidden', !enabled);
    this.mobileBanner.classList.toggle('hidden', !enabled);
    this.root.classList.toggle('touch-layout', enabled);
  }

  bindTouchControls(input: InputManager): void {
    if (this.touchSteerZone && this.touchSteerThumb) {
      input.bindVirtualJoystick(this.touchSteerZone, this.touchSteerThumb);
    }
    for (const [action, button] of this.touchButtons) {
      input.bindTouchButton(button, action);
    }
  }

  flash(kind: FlashKind): void {
    this.clearFlash();
    this.flashEl.dataset.kind = kind;
    this.flashEl.classList.add('active');
    if (kind === 'finish') {
      this.shell.classList.add('victory-pulse');
      window.setTimeout(() => this.shell.classList.remove('victory-pulse'), 620);
    }
    this.flashTimer = window.setTimeout(() => {
      this.flashEl.classList.remove('active');
      delete this.flashEl.dataset.kind;
      this.flashTimer = null;
    }, kind === 'finish' ? 520 : 260);
  }

  update(snapshot: RaceSnapshot, totalLaps: number): void {
    const player = snapshot.vehicles.find((v) => v.isPlayer) ?? snapshot.vehicles[0];
    if (!player) return;

    const playerEntry = snapshot.race.leaderboard.find((entry) => entry.isPlayer);
    const displayLap = Math.min(player.finished ? totalLaps : player.lap + 1, totalLaps);
    const speedKmh = Math.max(0, Math.round(Math.abs(player.speedForward) * 3.6));

    this.speedValue.textContent = `${speedKmh}`;
    this.rankValue.textContent = playerEntry ? `${playerEntry.rank}/${snapshot.race.leaderboard.length}` : '-';
    this.lapValue.textContent = `${displayLap} / ${totalLaps}`;
    this.timeValue.textContent = formatMs(snapshot.race.currentLapMs);
    this.bestValue.textContent = snapshot.race.bestLapMs ? formatMs(snapshot.race.bestLapMs) : '--';

    this.speedDialEl.style.setProperty('--speed-fill', `${Math.min(1, speedKmh / 180)}`);
    const drifting = !player.isOffTrack && speedKmh > 35 && (player.driftActive || player.slipRatio > 0.28);
    const boosting = snapshot.race.phase === 'racing' && player.driftBoostMs > 0;
    this.root.classList.toggle('is-fast', speedKmh >= 100);
    this.root.classList.toggle('is-drifting', drifting);
    this.root.classList.toggle('is-boosting', boosting);

    const driftIntensity = Math.min(1, player.slipRatio * 0.9 + (boosting ? 0.5 + player.driftBoostStrength * 0.4 : 0));
    this.root.style.setProperty('--drift-lines-opacity', `${(drifting || boosting) ? (0.08 + driftIntensity * 0.26) : 0}`);
    this.root.style.setProperty('--drift-lines-scale', `${1 + driftIntensity * 0.16}`);
    this.root.style.setProperty('--drift-lines-spin-ms', `${Math.round(520 - driftIntensity * 210)}ms`);
    this.driftLinesEl.classList.toggle('active', drifting || boosting);

    if (boosting) {
      this.driftBadgeEl.textContent = 'BOOST';
    } else if (drifting && player.driftChargeMs > 650) {
      this.driftBadgeEl.textContent = 'DRIFT+';
    } else {
      this.driftBadgeEl.textContent = 'DRIFT';
    }
    this.driftBadgeEl.classList.toggle('hidden', !((drifting || boosting) && snapshot.race.phase === 'racing'));

    const comboVisible = snapshot.race.phase === 'racing' && snapshot.race.comboLevel > 0;
    this.comboBadgeEl.classList.toggle('hidden', !comboVisible);
    this.comboValueEl.textContent = `x${snapshot.race.comboLevel}`;
    this.comboFillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, snapshot.race.comboMeter01))})`;
    this.comboBadgeEl.dataset.source = snapshot.race.comboSource;

    const overdriveMeter = Math.max(0, Math.min(1, snapshot.race.overdriveMeter01));
    this.overdriveFillEl.style.transform = `scaleX(${overdriveMeter})`;
    this.overdriveHudEl.dataset.state = snapshot.race.overdriveState;
    if (snapshot.race.overdriveState === 'active') {
      this.overdriveStateEl.textContent = 'OD ON';
    } else if (snapshot.race.overdriveState === 'overheated') {
      this.overdriveStateEl.textContent = 'OVERHEAT';
    } else if (overdriveMeter >= 0.35) {
      this.overdriveStateEl.textContent = 'READY';
    } else {
      this.overdriveStateEl.textContent = 'CHARGE';
    }

    if (playerEntry && this.lastPlayerRank !== null && playerEntry.rank !== this.lastPlayerRank) {
      this.flash(playerEntry.rank < this.lastPlayerRank ? 'overtake' : 'warn');
    }
    this.lastPlayerRank = playerEntry?.rank ?? null;
    this.updateLeaderboard(snapshot, totalLaps);

    if (snapshot.countdown.active && snapshot.countdown.label) {
      this.countdownEl.classList.add('visible');
      this.countdownEl.textContent = snapshot.countdown.label;
      if (snapshot.countdown.label !== this.lastCountdownLabel) {
        this.restartCountdownPulse();
        if (snapshot.countdown.label === 'GO') {
          this.flash('go');
        }
      }
      this.lastCountdownLabel = snapshot.countdown.label;
    } else {
      this.countdownEl.classList.remove('visible', 'pulse');
      this.countdownEl.textContent = '';
      this.lastCountdownLabel = null;
    }

    if (snapshot.message) {
      this.messageEl.classList.remove('hidden');
      this.messageEl.textContent = snapshot.message;
      this.messageEl.dataset.tone = snapshot.messageTone;
    } else {
      this.messageEl.classList.add('hidden');
      this.messageEl.textContent = '';
      this.messageEl.dataset.tone = 'info';
    }

    if (snapshot.race.phase === 'finished' && !this.lastShownFinish) {
      this.lastShownFinish = true;
      this.flash('finish');
    }
  }

  private buildTouchControls(): void {
    const leftCluster = document.createElement('div');
    leftCluster.className = 'touch-cluster touch-left';
    const rightCluster = document.createElement('div');
    rightCluster.className = 'touch-cluster touch-right';
    const joystick = document.createElement('div');
    joystick.id = 'touchSteerZone';
    joystick.className = 'touch-joystick';
    joystick.innerHTML = `
      <div class="touch-joystick-ring"></div>
      <div id="touchSteerThumb" class="touch-joystick-thumb"></div>
    `;

    const makeBtn = (action: TouchAction, label: string, classes = ''): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `touch-btn ${classes}`.trim();
      btn.textContent = label;
      this.touchButtons.set(action, btn);
      return btn;
    };

    leftCluster.append(joystick);

    rightCluster.append(makeBtn('throttle', 'GO', 'primary touch-main'));
    rightCluster.append(makeBtn('brake', 'BRAKE', 'touch-secondary'));
    rightCluster.append(makeBtn('handbrake', 'DRIFT', 'large touch-drift'));
    rightCluster.append(makeBtn('boost', 'BOOST', 'small touch-boost'));

    this.touchControls.append(leftCluster, rightCluster);
  }

  private refreshOrientation(): void {
    const isPortrait = window.innerHeight > window.innerWidth;
    this.shell.classList.toggle('is-portrait', isPortrait);
    this.portraitOverlay.classList.add('hidden');
  }

  private restartCountdownPulse(): void {
    this.countdownEl.classList.remove('pulse');
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add('pulse');
  }

  private clearFlash(): void {
    if (this.flashTimer !== null) {
      window.clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.flashEl.classList.remove('active');
    delete this.flashEl.dataset.kind;
    this.shell.classList.remove('victory-pulse');
  }

  private updateLeaderboard(snapshot: RaceSnapshot, totalLaps: number): void {
    const entries = snapshot.race.leaderboard;
    const key = entries
      .map((entry) => `${entry.vehicleId}:${entry.rank}:${entry.lap}:${entry.finished ? 1 : 0}`)
      .join('|');
    if (key === this.lastLeaderboardKey) return;
    this.lastLeaderboardKey = key;

    const vehiclesById = new Map(snapshot.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    this.leaderboardList.textContent = '';

    for (const entry of entries) {
      const li = document.createElement('li');
      if (entry.isPlayer) li.classList.add('player');

      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = String(entry.rank);

      const name = document.createElement('span');
      name.className = 'lb-name';
      const swatch = document.createElement('span');
      swatch.className = 'car-swatch';
      const vehicle = vehiclesById.get(entry.vehicleId);
      swatch.style.backgroundColor = vehicle ? `#${vehicle.colorHex.toString(16).padStart(6, '0')}` : '#ffffff';
      const nameText = document.createElement('span');
      nameText.textContent = entry.name;
      name.append(swatch, nameText);

      const lap = document.createElement('span');
      lap.className = 'lb-lap';
      lap.textContent = `L${Math.min(totalLaps, entry.lap + (entry.finished ? 0 : 1))}`;

      li.append(rank, name, lap);
      this.leaderboardList.append(li);
    }
  }
}

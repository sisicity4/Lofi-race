import { formatMs } from '../core/math';
import type { RaceSnapshot } from '../types/game';

interface ResultCallbacks {
  onRetry: () => void;
  onBackToTitle: () => void;
}

export class ResultView {
  readonly root: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly verdictEl: HTMLParagraphElement;
  private readonly listEl: HTMLUListElement;
  private callbacks: Partial<ResultCallbacks> = {};
  private visible = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'center-overlay hidden';
    this.root.innerHTML = `
      <div class="panel center-card">
        <p class="eyebrow">RACE RESULT</p>
        <h2 id="resultTitle" style="margin: 0 0 6px;">FINISH!</h2>
        <p id="resultVerdict" class="result-verdict">-</p>
        <p id="resultSubtitle" class="small">-</p>
        <ul id="resultList" class="result-list"></ul>
        <div class="btn-row">
          <button id="retryBtn" class="btn primary">もう一度</button>
          <button id="titleBtn" class="btn">タイトルへ</button>
        </div>
      </div>
    `;
    parent.append(this.root);

    this.titleEl = this.root.querySelector('#resultTitle') as HTMLHeadingElement;
    this.verdictEl = this.root.querySelector('#resultVerdict') as HTMLParagraphElement;
    this.subtitleEl = this.root.querySelector('#resultSubtitle') as HTMLParagraphElement;
    this.listEl = this.root.querySelector('#resultList') as HTMLUListElement;
    (this.root.querySelector('#retryBtn') as HTMLButtonElement).addEventListener('click', () => this.callbacks.onRetry?.());
    (this.root.querySelector('#titleBtn') as HTMLButtonElement).addEventListener('click', () => this.callbacks.onBackToTitle?.());
  }

  bind(callbacks: ResultCallbacks): void {
    this.callbacks = callbacks;
  }

  show(snapshot: RaceSnapshot, totalLaps: number): void {
    const player = snapshot.vehicles.find((v) => v.isPlayer);
    const rank = snapshot.race.leaderboard.find((e) => e.isPlayer)?.rank;
    this.titleEl.textContent = rank ? `FINISH! ${rank}位` : 'FINISH!';
    this.verdictEl.textContent = this.getVerdict(rank ?? 4, player);
    this.root.dataset.rank = String(rank ?? 4);
    this.subtitleEl.textContent = `合計 ${formatMs(snapshot.race.elapsedMs)} / ベストラップ ${snapshot.race.bestLapMs ? formatMs(snapshot.race.bestLapMs) : '--'} / MAX COMBO x${snapshot.race.maxCombo}`;

    this.listEl.innerHTML = '';
    for (const entry of snapshot.race.leaderboard) {
      const vehicle = snapshot.vehicles.find((v) => v.id === entry.vehicleId);
      const li = document.createElement('li');
      li.className = `result-item${entry.isPlayer ? ' player' : ''}`;
      const lapTimesText = vehicle?.lapTimesMs?.slice(0, totalLaps).map((ms) => formatMs(ms)).join(' / ') ?? '-';
      const swatch = vehicle ? `#${vehicle.colorHex.toString(16).padStart(6, '0')}` : '#ffffff';
      li.innerHTML = `
        <span>${entry.rank}</span>
        <div>
          <div style="font-weight:700; display:flex; align-items:center; gap:8px;">
            <span class="car-swatch" style="background:${swatch}"></span>
            <span>${entry.name}</span>
          </div>
          <div class="small">${lapTimesText}</div>
        </div>
        <span>${vehicle?.finished ? 'FIN' : `L${Math.min(totalLaps, (vehicle?.lap ?? 0) + 1)}`}</span>
      `;
      this.listEl.append(li);
    }

    if (player && player.lapTimesMs.length > 0) {
      const times = player.lapTimesMs.map((ms, i) => `L${i + 1} ${formatMs(ms)}`).join(' / ');
      this.subtitleEl.textContent += ` / ${times}`;
    }

    this.visible = true;
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.root.classList.add('hidden');
  }

  isVisible(): boolean {
    return this.visible;
  }

  private getVerdict(rank: number, player?: RaceSnapshot['vehicles'][number]): string {
    const bestLap = player?.lapTimesMs.length ? Math.min(...player.lapTimesMs) : null;
    if (rank === 1) return bestLap ? `優勝! ベスト ${formatMs(bestLap)}。そのライン、かなり良い。` : '優勝! きれいにまとめた。';
    if (rank === 2) return 'あと一歩。ブレーキングを詰めれば勝てる。';
    if (rank === 3) return '表彰台フィニッシュ。次は立ち上がり速度を意識。';
    return '完走。まずはコースに慣れた。次は攻めよう。';
  }
}

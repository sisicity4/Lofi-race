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
  private readonly achievementEl: HTMLParagraphElement;
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
        <p id="resultAchievement" class="result-achievement">-</p>
        <p id="resultSubtitle" class="small">-</p>
        <ul id="resultList" class="result-list"></ul>
        <div class="btn-row">
          <button id="retryBtn" class="btn primary">別のコースをプレイ</button>
          <button id="titleBtn" class="btn">タイトルへ</button>
        </div>
      </div>
    `;
    parent.append(this.root);

    this.titleEl = this.root.querySelector('#resultTitle') as HTMLHeadingElement;
    this.verdictEl = this.root.querySelector('#resultVerdict') as HTMLParagraphElement;
    this.achievementEl = this.root.querySelector('#resultAchievement') as HTMLParagraphElement;
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
    this.achievementEl.textContent = this.getAchievement(snapshot, rank ?? 4, player);
    this.root.dataset.rank = String(rank ?? 4);
    this.subtitleEl.textContent = `合計 ${formatMs(snapshot.race.elapsedMs)} / ベストラップ ${snapshot.race.bestLapMs ? formatMs(snapshot.race.bestLapMs) : '--'} / MAX COMBO x${snapshot.race.maxCombo}`;

    this.listEl.textContent = '';
    const vehiclesById = new Map(snapshot.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    for (const entry of snapshot.race.leaderboard) {
      const vehicle = vehiclesById.get(entry.vehicleId);
      const li = document.createElement('li');
      li.className = `result-item${entry.isPlayer ? ' player' : ''}`;
      const lapTimesText = vehicle?.lapTimesMs?.slice(0, totalLaps).map((ms) => formatMs(ms)).join(' / ') ?? '-';

      const rankCell = document.createElement('span');
      rankCell.textContent = String(entry.rank);

      const body = document.createElement('div');
      const nameRow = document.createElement('div');
      nameRow.style.fontWeight = '700';
      nameRow.style.display = 'flex';
      nameRow.style.alignItems = 'center';
      nameRow.style.gap = '8px';

      const swatch = document.createElement('span');
      swatch.className = 'car-swatch';
      swatch.style.backgroundColor = vehicle ? `#${vehicle.colorHex.toString(16).padStart(6, '0')}` : '#ffffff';
      const nameText = document.createElement('span');
      nameText.textContent = entry.name;
      nameRow.append(swatch, nameText);

      const lapTimes = document.createElement('div');
      lapTimes.className = 'small';
      lapTimes.textContent = lapTimesText;
      body.append(nameRow, lapTimes);

      const stateCell = document.createElement('span');
      stateCell.textContent = vehicle?.finished ? 'FIN' : `L${Math.min(totalLaps, (vehicle?.lap ?? 0) + 1)}`;

      li.append(rankCell, body, stateCell);
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

  private getAchievement(snapshot: RaceSnapshot, rank: number, player?: RaceSnapshot['vehicles'][number]): string {
    if (rank === 1) return 'VISUAL ACHIEVEMENT / GOLD FINISH';
    if (snapshot.race.maxCombo >= 4) return `VISUAL ACHIEVEMENT / MAX COMBO x${snapshot.race.maxCombo}`;
    if (player?.lapTimesMs.length) {
      const bestLap = Math.min(...player.lapTimesMs);
      if (snapshot.race.bestLapMs !== null && bestLap <= snapshot.race.bestLapMs) {
        return 'VISUAL ACHIEVEMENT / BEST LAP';
      }
    }
    return 'VISUAL ACHIEVEMENT / RACE COMPLETE';
  }
}

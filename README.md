# Web Racing

ブラウザだけで動く、ローポリ3Dアーケードレースゲームです。  
Three.js + TypeScript + Vite の構成で、PCブラウザ向けの3Dレース体験として実装しています。

## 公開URL
- Vercel: https://lofi-race.vercel.app
- GitHub Pages: https://sisicity4.github.io/Lofi-race/

## 実装済みの主な内容
- 5コース（Raceway / Desert / Forest / Studio / SOL ABYSS）
- 1レースあたり3ラップ固定
- プレイヤー1台 + CPU3台
- 初回表示コースはランダム
- スタート時は「メニューで表示中のコース」で開始
- リザルト画面から「別のコースをプレイ」で次レースへ
- ドリフト + コンボ + OVERDRIVE
- 場外判定（爆発演出）と安全位置リスポーン
- デスクトップ操作（スマホアクセス時はPCブラウザ案内を表示）
- 待機中ループBGM（`Pixel_Pavement.mp3`）と各種SE

## SOL ABYSS

`SOL ABYSS / ソル・アビス（異常空間）` は、異常空間をテーマにした追加ステージです。

- 高速で駆け抜けられる、急カーブを抑えたフロー型コース
- シェーダーで脈動する恒星核と重力リング
- ネオン道路、星粒子、浮遊破片、異常空間を表現した専用景観
- Low画質では装飾を削減しつつ、道路やゲートの視認性を維持

## 技術スタック
- `TypeScript`
- `Vite`
- `Three.js`
- `Vanilla HTML/CSS`
- `Vitest`
- `Playwright`

## セットアップ
```bash
npm install
npm run dev
```

## 操作方法
### Desktop
- `W / ↑`: アクセル（ホールド）
- `S / ↓`: ブレーキ（ホールド）
- `A / D / ← / →`: ステア
- `Space`: ドリフト（ホールド）
- `Shift`: OVERDRIVE
  - タップで即発動判定
  - ゲージ不足時は押しっぱなしで予約し、閾値到達時に自動発動
- `Esc`: ポーズ
- `M`: ミュート切替

補足:
- 初期設定は「左右操作反転 ON」です（メニューから変更可）。

### Mobile
- スマホ版の開発は一旦停止中です。スマホでアクセスした場合は、PCブラウザで遊ぶよう案内します。

## 設定保存（localStorage）
- 選択中コースID
- 画質
- ミュート状態
- マスター音量
- 左右反転設定
- ベストラップ

## 開発コマンド
- `npm run dev`: 開発サーバ起動
- `npm run build`: 本番ビルド
- `npm run build:pages`: GitHub Pages向けビルド
- `npm run preview`: ビルド結果のローカル確認
- `npm run test`: Unitテスト
- `npm run test:e2e`: E2Eテスト（Chromium / Firefox / WebKit）
- `npm run test:e2e:chromium`: E2Eテスト（Chromiumのみ）

## デプロイ
### Vercel
- `main` への push をトリガに本番更新する運用を推奨
- セキュリティヘッダは `vercel.json` で設定済み

### GitHub Pages
- `.github/workflows/deploy-pages.yml` で `main` push 時に自動デプロイ
- `npm run build:pages` を使って Pages 用 base path でビルド
- `vite.config.ts` は `GITHUB_REPOSITORY` / `GITHUB_PAGES_BASE` を考慮

## 品質確認
最低限の確認手順:
```bash
npm run build
npm run test
npm run test:e2e -- tests/e2e/smoke.spec.ts
```

## ブランチ運用
- `main`: 本番デプロイ用の安定ブランチ
- `dev`: 開発統合ブランチ

基本フロー:
1. 日常作業は `dev` に集約
2. 実装 + テスト
3. リリース時に `dev` から `main` へ反映

## ライセンス
MIT

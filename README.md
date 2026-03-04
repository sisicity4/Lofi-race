# Web Racing (MVP)

ブラウザだけで動くローポリ3DレーシングゲームのMVPです。

## Live URL
- https://lofi-race.vercel.app
- https://sisicity4.github.io/Lofi-race/

## Tech
- Vite
- TypeScript
- Three.js
- Vanilla HTML/CSS
- Vitest / Playwright

## Run
```bash
npm install
npm run dev
```

## Controls
### Desktop
- `WASD` / `Arrow Keys`: アクセル / ブレーキ / ステア（初期設定: 左右反転ON）
- `Space`: ドリフト補助
- `Shift`: OVERDRIVE
- `Esc`: ポーズ
- `M`: ミュート

### Mobile
- タッチボタン操作（横画面推奨）

## Notes
- 現在のMVPはプロシージャルなローポリメッシュでコース/車を描画しています。
- `public/assets/models/*.glb` は将来のGLTF差し替え用プレースホルダです。
- `public/assets/audio/` は将来の音源差し替え用プレースホルダです（現状はWeb Audio合成音）。

## Scripts
- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run test:e2e`

## Branch Workflow
- `main`: 本番デプロイ用の安定ブランチ（Vercel / GitHub Pages）
- `dev`: 開発統合ブランチ
- `feature/*`: 機能追加
- `fix/*`: バグ修正
- `chore/*`: ツール・設定・ドキュメント更新

### Basic Flow
1. `dev` から `feature/*` / `fix/*` / `chore/*` を作成
2. ブランチ上で実装とテストを完了
3. `dev` にマージして統合確認
4. リリース時に `main` へマージ

## License
MIT

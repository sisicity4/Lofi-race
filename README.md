# Web Racing (MVP)

ブラウザだけで動くローポリ3DレーシングゲームのMVPです。

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
- `WASD` / `Arrow Keys`: アクセル / ブレーキ / ステア
- `Space`: ドリフト補助
- `R`: リセット
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

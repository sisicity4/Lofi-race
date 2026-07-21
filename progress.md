Original prompt: コースを全てリビルドして / レビューとプレビューも

## Progress
- Started on `dev` with a clean worktree.
- Goal: rebuild the four playable tracks, separate low-sharp-turn and high-sharp-turn stages, then run review and preview checks.
- Added shared track blueprint generator and `npm run tracks:build`.
- Regenerated four playable long-track JSON files.
- Added unit coverage for generated JSON sync, sharp-turn distribution, and learnability tuning.
- Preview surfaced a Vercel Analytics CSP error; updated `index.html` and `vercel.json` to allow the analytics script/connect targets.
- Review cleanup: removed an unused `TrackLoader` helper left after moving fallback generation into `trackBlueprints.js`.
- Follow-up goal: reduce turn frustration by rebuilding Desert/Forest/Studio around larger radii without changing vehicle physics.
- Rebuilt Desert/Forest/Studio again so the first corner entries are more gradual and the difficulty comes from flowing S-curves rather than 90-degree turn spikes.
- Raised the loaded target-speed floor to keep slow corners from requiring extreme deceleration.
- Final track metrics: Raceway max 22.9 deg / 0 sharp turns, Desert max 50.1 deg / 4 sharp turns, Forest max 59.5 deg / 5 sharp turns, Studio max 48.0 deg / 2 sharp turns.
- Final checks passed: `npm test`, `npm run build`, `npm run test:e2e:chromium`, web-game Playwright client, four-track preview screenshots, and four-track short steering smoke screenshots.

## TODO
- Full-lap human playtest for final feel tuning.

## SOL ABYSS stage
- Added a fifth high-speed flow track, `sol-abyss-gp-01`, with generated metadata and loader fallback.
- Added the `sol-abyss` visual theme: shader-driven stellar core, gravity rings, neon road treatment, particles, monoliths, and floating shards.
- Low graphics quality hides the high-density particles and distant shard field while preserving gameplay guides.
- Measured blueprint metrics: 75 waypoints, 10 checkpoints, 23.43 degree maximum turn, 30.8 minimum target speed, 13.7 maximum width.
- Build passed after the first implementation chunk.
- Unit tests passed (59 tests). The first Chromium E2E run found only a stale four-track count; updated the smoke flow to select SOL ABYSS explicitly.
- SOL ABYSS targeted E2E passed. Standard and low quality gameplay screenshots were visually inspected; low quality correctly removes particles/shards while keeping the road, rails, gates, and monoliths readable.

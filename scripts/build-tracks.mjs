import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYABLE_TRACK_SPECS, createTrackFromSpec } from '../src/track/trackBlueprints.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/assets/data');

await mkdir(outDir, { recursive: true });

for (const spec of PLAYABLE_TRACK_SPECS) {
  const track = createTrackFromSpec(spec);
  const outPath = resolve(outDir, spec.outputFile);
  await writeFile(outPath, `${JSON.stringify(track, null, 2)}\n`, 'utf8');
  console.log(`wrote ${spec.outputFile}: ${track.waypoints.length} waypoints, ${track.checkpoints.length} checkpoints`);
}

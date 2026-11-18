// Neon Salvage — the entry program (Node 22, standard library only).
// It assembles the submission in /output (or $MAKEFUN_OUTPUT_DIR when set):
// a fresh copy of game/ and screenshots/ from beside this file, plus a
// dossier.json written by the vendored make.fun library. Running it twice
// must produce the same bytes, so every stale output directory is removed
// before the fresh copy goes in.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyFresh(sourceDir, targetDir) {
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  if (existsSync(sourceDir)) cpSync(sourceDir, targetDir, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFresh(join(repoRoot, 'game'), join(outputDir, 'game'));
copyFresh(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

// The scorer's own caps, as the competition's reference gate.json gives
// them: only text_max_bytes shapes the dossier bytes; the rest refuse an
// entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files in all,
// or a path under game/ over 1000 bytes).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

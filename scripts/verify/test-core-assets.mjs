/**
 * Runs `scripts/verify/core-assets.test.ts` with Node's built-in test runner (no extra Generator dependencies).
 * Run: node scripts/verify/test-core-assets.mjs
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outfile = join(root, 'scripts/verify/out/.harness/core-assets.test.mjs');
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [join(root, 'scripts/verify/core-assets.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent'
});

const run = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
process.exit(run.status ?? 1);

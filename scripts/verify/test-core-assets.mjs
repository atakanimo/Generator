/**
 * Runs `scripts/verify/core-assets.test.ts` with Node's built-in test runner (no extra Generator dependencies).
 * `mongoose` comes from Varlik360's `node_modules`: `VARLIK360`, else the `Varlik360` / `Varlik360-Backend-Admin` folder
 * next to the Generator.
 * Run: node scripts/verify/test-core-assets.mjs
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const varlik =
  process.env.VARLIK360 ??
  ['Varlik360', 'Varlik360-Backend-Admin'].map((name) => join(dirname(root), name)).find((dir) => existsSync(join(dir, 'node_modules/mongoose')));
if (!varlik || !existsSync(join(varlik, 'node_modules/mongoose'))) {
  console.error('Varlik360 (node_modules/mongoose ile) bulunamadı; VARLIK360 ile verin.');
  process.exit(1);
}
const outfile = join(root, 'scripts/verify/out/.harness/core-assets.test.mjs');
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [join(root, 'scripts/verify/core-assets.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'silent',
  plugins: [
    {
      // `service-hooks` imports the host-aware error helper (request context, logger); the test only needs its shape.
      name: 'stub-error-helper',
      setup(api) {
        api.onResolve({ filter: /^@core\/errors\/error\.helper$/ }, () => ({ path: 'error-helper', namespace: 'stub' }));
        api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const HandleServiceError = (error, opts) => ({ isSuccess: false, data: null, uiMessage: null, errorData: { message: String(error?.message ?? error), header: opts?.context ?? "", code: 500 } });',
          loader: 'js'
        }));
      }
    }
  ]
});

const run = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit', env: { ...process.env, VARLIK360: varlik } });
process.exit(run.status ?? 1);

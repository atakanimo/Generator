#!/usr/bin/env node
/**
 * Var olan host'un core asset'lerini Generator'daki güncel hâliyle karşılaştırır. Asset'ler
 * create-only yazıldığı için Generator düzeltmeleri eski host'lara kendiliğinden gitmez; bu komut farkı gösterir ve
 * yalnız onaylanan dosyaları yazar. Stack host'tan bulunur (.NET, Python, Express; istemci uygulaması: ortak HTTP katmanı,
 * docs/frontend/http-layer.md). Skeleton dosyaları kapsam dışı. Projeye ait dosyalar (istemcide `api/auth.ts`,
 * `api/hooks.ts`) yalnız yoksa yazılır; varsa `proje` olarak listelenir, dokunulmaz.
 *
 *   node scripts/assets-sync.mjs <dir>                       özet: eksik / farklı / aynı (yazmaz)
 *   node scripts/assets-sync.mjs <dir> --diff [yol…]         farklı dosyaların diff'i (yol verilirse yalnız onlar)
 *   node scripts/assets-sync.mjs <dir> --apply yol [yol…]    yalnız verilen dosyaları yazar
 *   node scripts/assets-sync.mjs <dir> --apply-all           bütün eksik / farklı dosyaları yazar
 *
 * Yazmadan önce host'ta commit / yedek olmalı: host'ta elle yapılmış değişiklik varsa üzerine yazılır.
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--'));
const mode = args.find((a) => a.startsWith('--')) ?? '';
const paths = args.filter((a) => !a.startsWith('--') && a !== dirArg);

if (!dirArg || !['', '--diff', '--apply', '--apply-all'].includes(mode) || (mode === '--apply' && paths.length === 0)) {
  console.error('Kullanım: node scripts/assets-sync.mjs <dir> [--diff [yol…] | --apply yol [yol…] | --apply-all]');
  process.exit(1);
}

async function loadGenerator() {
  const outfile = join(root, 'scripts/verify/out/.harness/assets-sync-bundle.mjs');
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, 'scripts/verify/_assets-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    plugins: [
      {
        name: 'stub-electron',
        setup(api) {
          api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub-electron' }));
          api.onLoad({ filter: /.*/, namespace: 'stub-electron' }, () => ({
            contents: `export const app = { getAppPath: () => ${JSON.stringify(root)}, isPackaged: false };`,
            loader: 'js'
          }));
        }
      }
    ],
    logLevel: 'silent'
  });
  return import(pathToFileURL(outfile).href);
}

const dir = resolve(dirArg);
const gen = await loadGenerator();
let plan;
try {
  plan = gen.planHostAssets(dir);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (!plan) {
  console.error(`Host tanınmadı (.NET .slnx/.sln, Python pyproject + src/<pkg>/core, istemci package.json (React) + src/, Express package.json + src/core): ${dir}`);
  process.exit(1);
}
const diffs = gen.diffAssets(plan);
const pending = diffs.filter((d) => d.status === 'missing' || d.status === 'differs');

if (mode === '') {
  const count = (status) => diffs.filter((d) => d.status === status).length;
  const owned = count('owned');
  console.log(`${plan.stack}${plan.platform ? ` (${plan.platform})` : ''}: ${diffs.length} asset — eksik ${count('missing')}, farklı ${count('differs')}, aynı ${count('same')}${owned ? `, proje ${owned}` : ''}`);
  for (const d of pending) console.log(`  ${d.status === 'missing' ? '+' : '~'} ${d.rel}${d.createOnly ? ' (projeye ait; yalnız bu kez yazılır)' : ''}`);
  for (const note of plan.notes ?? []) console.log(`  ! ${note}`);
  if (pending.length) console.log('\nFark: --diff [yol…]  Yaz: --apply yol [yol…] | --apply-all');
} else if (mode === '--diff') {
  const tmp = mkdtempSync(join(tmpdir(), 'assets-sync-'));
  try {
    for (const d of pending.filter((p) => paths.length === 0 || paths.includes(p.rel))) {
      const a = join(tmp, 'host'), b = join(tmp, 'generator');
      writeFileSync(a, d.current ?? '');
      writeFileSync(b, d.content);
      const r = spawnSync('git', ['--no-pager', 'diff', '--no-index', '--no-color', `--src-prefix=host/`, `--dst-prefix=generator/`, a, b], { encoding: 'utf8' });
      console.log(`=== ${d.status === 'missing' ? '(yeni) ' : ''}${d.rel}`);
      console.log((r.stdout || '').split('\n').slice(4).join('\n'));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else {
  const unknown = paths.filter((p) => !diffs.some((d) => d.rel === p));
  if (unknown.length) {
    console.error(`Asset listesinde olmayan yol: ${unknown.join(', ')}`);
    process.exit(1);
  }
  const written = gen.applyAssets(diffs, mode === '--apply-all' ? pending.map((d) => d.rel) : paths);
  for (const rel of written) console.log(`  yazıldı ${rel}`);
  console.log(`${written.length} dosya yazıldı.`);
}

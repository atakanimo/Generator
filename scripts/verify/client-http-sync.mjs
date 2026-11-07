#!/usr/bin/env node
/**
 * Ortak HTTP katmanı asset sync gate'i (docs/frontend/http-layer.md "Generator'dan yazma"). Geçici bir workspace'te
 * (`out/client-http-sync/`, sonunda silinir; hata ya da --keep ile kalır) uygulamanın `planHostAssets` / `diffAssets` /
 * `applyAssets` çağrıları:
 *  1. Platform `package.json`'dan (admin / web / mobil); manifest'teki elle seçim tespitin önüne geçer; plan manifest'e yazmaz.
 *  2. Boş uygulama: 5 dosya eksik; ortaklar platformun kaynağıyla, `api/auth.ts` doğru köprüyle (admin → legacy-admin,
 *     mobil → legacy-mobile, üretilen auth'u olan → generated) yazılır.
 *  3. İkinci plan: ortaklar `same`, `api/auth.ts` / `api/hooks.ts` `owned`; hiçbir şey yazılmaz.
 *  4. Projede değişen `hooks.ts` / `auth.ts` `owned` kalır, yazılmaz; değişen `index.ts` `differs` olur ve geri yazılır.
 *  5. Üretilen auth'u olmayan web: `auth.ts` listede yok, not var; eski `services/api.ts` notu.
 *  6. Express host'u (React yok) hâlâ Express olarak tanınır.
 *  7. Ortak `index.ts` dili yalnız `Accept-Language` ile gönderir (api-contract K6).
 *
 *   node scripts/verify/client-http-sync.mjs [--keep]
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const assets = join(root, 'src/generator-assets/client-http');
const out = join(root, 'scripts/verify/out/client-http-sync');
const keep = process.argv.includes('--keep');

const outfile = join(root, 'scripts/verify/out/.harness/client-http-sync-bundle.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(root, 'scripts/verify/_assets-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(api) {
    api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const app = { getAppPath: () => ${JSON.stringify(root)}, isPackaged: false };`, loader: 'js' }));
  } }]
});
const gen = await import(pathToFileURL(outfile).href);

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
}
const read = path => readFileSync(path, 'utf8');
const source = rel => read(join(assets, rel));
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const statusOf = (diffs, rel) => diffs.find(d => d.rel === rel)?.status;

rmSync(out, { recursive: true, force: true });
const ws = join(out, 'workspace');
const manifestPath = join(ws, '.generator/manifest.json');
const manifest = JSON.stringify({ version: 3, models: [], workspace: { clientPlatforms: { 'apps/forced': 'mobile' } } }, null, 2);
write(manifestPath, manifest);

function app(name, deps, files = {}) {
  const dir = join(ws, 'apps', name);
  write(join(dir, 'package.json'), JSON.stringify({ name, dependencies: deps }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (const [rel, text] of Object.entries(files)) write(join(dir, rel), text);
  return dir;
}
const ADMIN = { '@atakanimo/ata-admin-base': '1.0.0', react: '19.0.0', 'react-dom': '19.0.0' };
const WEB = { react: '19.0.0', 'react-dom': '19.0.0' };
const MOBILE = { react: '19.0.0', 'react-native': '0.80.0' };

const admin = app('admin', ADMIN);
const mobile = app('mobile', MOBILE);
const web = app('web', WEB, { 'src/services/authRefresh.generated.ts': '// stub\n' });
const bareWeb = app('bare-web', WEB, { 'src/services/api.ts': '// eski\n' });
const forced = app('forced', WEB);
const express = join(ws, 'api');
write(join(express, 'package.json'), JSON.stringify({ name: 'api', dependencies: { express: '5.0.0', mongoose: '8.0.0' } }));
mkdirSync(join(express, 'src/core'), { recursive: true });

const SHARED = ['src/services/api/index.ts', 'src/services/api/platform.ts', 'src/types/API/response.ts'];
const OWNED = ['src/services/api/hooks.ts', 'src/services/api/auth.ts'];

// 7) İstek dili header'ı
{
  const index = source('shared/services/api/index.ts');
  check('index.ts Accept-Language gönderir', /headers\.set\(\s*'Accept-Language'/.test(index));
  check('index.ts lang / x-lang göndermez', !/headers\.set\(\s*'(lang|x-lang|X-Lang)'/.test(index));
}

// 1) Platform
const plans = { admin: gen.planHostAssets(admin), mobile: gen.planHostAssets(mobile), web: gen.planHostAssets(web), forced: gen.planHostAssets(forced) };
check('admin platform', plans.admin?.stack === 'client-http' && plans.admin.platform === 'admin', JSON.stringify(plans.admin?.platform));
check('mobil platform', plans.mobile?.platform === 'mobile');
check('web platform', plans.web?.platform === 'web');
check('manifest seçimi tespitin önüne geçer (forced: web → mobile)', plans.forced?.platform === 'mobile', String(plans.forced?.platform));
check('plan manifest\'e yazmaz', read(manifestPath) === manifest);
const expressPlan = gen.planHostAssets(express);
check('Express host\'u Express kalır', expressPlan?.stack === 'express-mongoose', String(expressPlan?.stack));

// 2) Boş uygulama → yaz
const expectBridge = { admin: 'legacy-admin', mobile: 'legacy-mobile', web: 'generated' };
const adapter = { admin: 'browser', mobile: 'mobile', web: 'browser' };
for (const [name, dir] of [['admin', admin], ['mobile', mobile], ['web', web]]) {
  const diffs = gen.diffAssets(plans[name]);
  check(`${name}: 5 dosya eksik`, diffs.length === 5 && diffs.every(d => d.status === 'missing'), diffs.map(d => `${d.rel}:${d.status}`).join(' '));
  const written = gen.applyAssets(diffs, diffs.map(d => d.rel));
  check(`${name}: 5 dosya yazıldı`, written.length === 5, written.join(' '));
  check(`${name}: index.ts = ortak`, read(join(dir, SHARED[0])) === source('shared/services/api/index.ts'));
  check(`${name}: platform.ts = ${adapter[name]}`, read(join(dir, SHARED[1])) === source(`platform/${adapter[name]}/services/api/platform.ts`));
  check(`${name}: response.ts = ortak`, read(join(dir, SHARED[2])) === source('shared/types/API/response.ts'));
  check(`${name}: auth.ts = ${expectBridge[name]}`, read(join(dir, OWNED[1])) === source(`auth-bridge/${expectBridge[name]}/services/api/auth.ts`));
  check(`${name}: hooks.ts = boş başlangıç`, read(join(dir, OWNED[0])) === source('shared/services/api/hooks.ts'));
}

// 3) İkinci plan: hiçbir şey yazılmaz
{
  const diffs = gen.diffAssets(gen.planHostAssets(admin));
  check('ikinci plan: ortaklar same', SHARED.every(rel => statusOf(diffs, rel) === 'same'));
  check('ikinci plan: proje dosyaları owned', OWNED.every(rel => statusOf(diffs, rel) === 'owned'));
  check('ikinci apply hiçbir şey yazmaz', gen.applyAssets(diffs, diffs.map(d => d.rel)).length === 0);
}

// 4) Projede değişenler
{
  const hooks = "export const apiHooks = { onError: () => true };\n";
  const auth = '// projenin köprüsü\n';
  write(join(admin, OWNED[0]), hooks);
  write(join(admin, OWNED[1]), auth);
  write(join(admin, SHARED[0]), '// elle değiştirildi\n');
  const diffs = gen.diffAssets(gen.planHostAssets(admin));
  check('değişen hooks.ts / auth.ts owned', OWNED.every(rel => statusOf(diffs, rel) === 'owned'));
  check('değişen index.ts differs', statusOf(diffs, SHARED[0]) === 'differs');
  const written = gen.applyAssets(diffs, diffs.map(d => d.rel));
  check('yalnız index.ts yazıldı', written.length === 1 && written[0] === SHARED[0], written.join(' '));
  check('hooks.ts / auth.ts korundu', read(join(admin, OWNED[0])) === hooks && read(join(admin, OWNED[1])) === auth);
  check('index.ts geri geldi', read(join(admin, SHARED[0])) === source('shared/services/api/index.ts'));
}

// 5) Üretilen auth'u olmayan web + eski düz dosya
{
  const plan = gen.planHostAssets(bareWeb);
  check('bare web: auth.ts listede yok', plan.entries.length === 4 && !plan.entries.some(e => e.rel === OWNED[1]), plan.entries.map(e => e.rel).join(' '));
  check('bare web: köprü notu', plan.notes.some(n => n.includes('api/auth.ts')));
  check('bare web: eski services/api.ts notu', plan.notes.some(n => n.includes('src/services/api.ts')));
  check('bare web: eski dosyaya dokunulmaz', existsSync(join(bareWeb, 'src/services/api.ts')));
}

if (!keep && !failed) rmSync(out, { recursive: true, force: true });
console.log(`\n[client-http-sync] ${failed ? `${failed} FAIL` : 'ok'}${failed || keep ? ` (çıktı: ${out})` : ''}`);
process.exit(failed ? 1 : 0);

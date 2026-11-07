#!/usr/bin/env node
/**
 * New admin panel gate (`project:bootstrapAdmin`, docs/frontend/admin-host.md).
 *
 * In `out/admin-bootstrap/` (removed at the end; kept on failure or with --keep):
 *  1. The app's `bootstrapAdminProject` for each backend stack: no token left, auth prefix / dev URL of that stack,
 *     package name (`OrdersApi` → `orders-api-admin`); a second bootstrap is refused and writes nothing; bad name refused.
 *  2. Info (`src/shared/adminPanel.ts`, the button's popover): every tree entry marked `bootstrap` exists; the doc
 *     exists; the skeleton's `@atakanimo/ata-admin-base` range is the package version in `packages/admin-base`.
 *  3. `--install`: `npm install`, two Varlik360 models (`symbol-types`, `symbols`: relation) written with the app's
 *     `generateAdminConfig`, then `npm run typecheck` (0 errors) and `npm run build` in the panel.
 *
 *   node scripts/verify/admin-bootstrap.mjs [--install] [--keep]
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const keep = process.argv.includes('--keep');
const install = process.argv.includes('--install');
const out = join(root, 'scripts/verify/out/admin-bootstrap');
const varlik = '/Users/atakanatabey/Projects/VarlikALL/Varlik360';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
  return ok;
}

const outfile = join(root, 'scripts/verify/out/.harness/admin-bootstrap-bundle.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(root, 'scripts/verify/_admin-bootstrap-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(api) {
    api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };', loader: 'js' }));
  } }]
});
const b = await import(pathToFileURL(outfile).href);

function listFiles(dir, skip = new Set(['node_modules', 'dist'])) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...listFiles(full, skip));
    else files.push(full);
  }
  return files;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Bootstrap per stack
for (const stack of Object.keys(b.ADMIN_BACKEND_DEFAULTS)) {
  const panel = join(out, stack);
  const { apiPrefix, devUrl } = b.ADMIN_BACKEND_DEFAULTS[stack];
  const r = b.bootstrapAdminProject(panel, 'OrdersApi', stack);
  if (!check(`${stack}: bootstrap`, r.success, r.error ?? `${r.files?.length} files`)) continue;
  check(`${stack}: package name`, r.package === 'orders-api-admin', r.package);
  const leftovers = listFiles(panel).filter((f) => /__App__|__app__|__API_/.test(readFileSync(f, 'utf8')) || /__App__|__app__/.test(f));
  check(`${stack}: no token left`, leftovers.length === 0, leftovers.join(', '));
  const config = readFileSync(join(panel, 'src/config/app.ts'), 'utf8');
  check(`${stack}: auth prefix ${apiPrefix}`, config.includes(`'${apiPrefix}/auth/login'`) && config.includes(`'${apiPrefix}/auth/me'`));
  check(`${stack}: dev proxy ${devUrl}`, readFileSync(join(panel, '.env.development'), 'utf8').includes(`VITE_API_PROXY=${devUrl}`));
  const missing = b.stackTreePaths(b.ADMIN_PANEL_INFO, { app: 'OrdersApi', pkg: 'orders-api-admin' }).filter((p) => !existsSync(join(panel, p)));
  check(`${stack}: info tree entries exist`, missing.length === 0, missing.join(', '));
  const again = b.bootstrapAdminProject(panel, 'OrdersApi', stack);
  check(`${stack}: second bootstrap refused`, !again.success && !again.files, again.error);
}
check('bad name refused', !b.bootstrapAdminProject(join(out, 'bad'), '123', 'nodejs-mongoose').success);
check('name ending in Admin kept', b.toAdminPackageName('OrdersAdmin') === 'orders-admin', b.toAdminPackageName('OrdersAdmin'));

// 2. Info + versions
check('doc exists', existsSync(join(root, b.ADMIN_PANEL_INFO.doc)), b.ADMIN_PANEL_INFO.doc);
const pkgVersion = JSON.parse(readFileSync(join(root, 'packages/admin-base/package.json'), 'utf8')).version;
const range = JSON.parse(readFileSync(join(out, 'nodejs-mongoose/package.json'), 'utf8')).dependencies['@atakanimo/ata-admin-base'];
check('skeleton admin-base range = packages/admin-base version', range === `^${pkgVersion}`, `${range} vs ${pkgVersion}`);

// 3. Install, two generated modules, typecheck + build
if (install) {
  const panel = join(out, 'nodejs-mongoose');
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: panel, encoding: 'utf8', stdio: 'pipe' });
  const npmInstall = run('npm', ['install', '--no-audit', '--no-fund']);
  if (check('npm install', npmInstall.status === 0, npmInstall.status === 0 ? '' : npmInstall.stderr.slice(-800))) {
    const workspace = join(out, 'workspace');
    mkdirSync(join(workspace, '.generator'), { recursive: true });
    cpSync(join(root, 'scripts/verify/fixtures/varlik360.manifest.v3.json'), join(workspace, '.generator/manifest.json'));
    const clientModels = [];
    for (const mod of ['symbol-types', 'symbols']) {
      const rel = `src/modules/${mod}/${mod}.model.ts`;
      const parsed = b.parseNormalizedModel(join(varlik, rel), 'nodejs-mongoose');
      const model = b.mergeModel(parsed.model, b.findManifestModelByRelativePath(workspace, rel), 'nodejs-mongoose');
      const r = b.generateAdminConfig({ model, frontendRoot: panel, backendRoot: varlik, baseUrl: '/api' });
      check(`admin config ${mod}`, r.success, r.error);
      clientModels.push(model);
    }
    // Client data layer (services + thunks: module slices need the host's root reducer) + shared auth, browser variant (docs/frontend/client-data-layer.md): must compile in a React web host.
    const clientAuth = b.generateClientModules({
      clientRoot: panel, preset: b.REDUX_WEB_PRESET, models: clientModels, allModels: clientModels, baseUrl: '/api', layers: { slice: false },
      auth: { modules: ['register', 'password-reset', 'google', 'apple', 'account-delete'], prefix: '/api', storagePrefix: 'admin' }
    });
    const authFiles = clientAuth.files.filter(f => /\/auth[^/]*\.generated\.ts$/.test(f.path)).length;
    check('client auth files (redux-web)', authFiles === 5, clientAuth.files.map(f => f.path));
    const typecheck = run('npm', ['run', 'typecheck']);
    check('npm run typecheck', typecheck.status === 0, typecheck.status === 0 ? '' : typecheck.stdout.slice(-1500));
    // Hosts with `verbatimModuleSyntax` (StockExchange web): generated files import types with `import type` / `type X`.
    const generated = new Set(clientAuth.files.map(f => relative(panel, f.path)));
    const verbatim = run('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit', '--verbatimModuleSyntax']);
    const verbatimErrors = (verbatim.stdout ?? '').split('\n').filter(l => generated.has(l.split('(')[0]));
    check('client files compile with verbatimModuleSyntax', verbatimErrors.length === 0, verbatimErrors.join('\n').slice(0, 1500));
    const viteBuild = run('npm', ['run', 'build']);
    check('npm run build', viteBuild.status === 0, viteBuild.status === 0 ? '' : (viteBuild.stdout + viteBuild.stderr).slice(-1500));
  }
}

if (!failed && !keep) rmSync(out, { recursive: true, force: true });
console.log(`[admin-bootstrap] ${failed ? `FAIL (${failed})` : 'ok'}${failed || keep ? `  kept: ${out}` : ''}`);
process.exit(failed ? 1 : 0);

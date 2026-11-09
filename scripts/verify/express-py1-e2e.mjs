#!/usr/bin/env node
/**
 * Express PY1 gate (plan backend-python-fastapi PY1): the `Reminders` fixture model (fixtures/dotnet/models.json:
 * numeric enum, date-only, int, constraints, email) generated into a Varlik360 copy, run over HTTP against Mongo in
 * Docker, then `dotnet-py1-formats-smoke.mjs` — the same scenarios the .NET host passes.
 *
 *  1. Copy of Varlik360 (`src`, `tsconfig.json`, `package.json`, node_modules symlink) in `out/express-py1/`;
 *     the Generator assets the generated modules call (`CORE_OVERLAY`) overlaid on the host's `src/core`. The rest of
 *     the host's core has drifted from the assets for non-PY1 reasons (logging, `SortOrder`), so it is left as is.
 *  2. `generateBackend` (the app's call) for `Reminders`: model, schema, filters, services, admin routes, and the
 *     admin router mounted in the BE app file (Varlik360: `src/app.ts`, inside `createApp`).
 *  3. `tsc --noEmit` in the copy: 0 errors (the new module adds no locale keys; CRUD messages are the host's `crud.*`).
 *  4. Mongo (`mongo:7`, :27029) + Varlik360's HTTP app from the copy (`fixtures/express-parity-host.ts`) → smoke.
 *
 * Needs Docker (OrbStack) and Varlik360 checked out with node_modules. Varlik360 sources are read, never changed.
 *
 *   node scripts/verify/express-py1-e2e.mjs [--keep]
 */
import { build } from 'esbuild';
import { spawn, spawnSync } from 'child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const varlik = process.env.VARLIK360 ?? '/Users/atakanatabey/Projects/AtaAllWorkspace/Varlik360';
const out = join(root, 'scripts/verify/out/express-py1');
const assets = join(root, 'src/generator-assets/express-mongoose');
const keep = process.argv.includes('--keep');
const CORE_OVERLAY = [
  'services/base-crud.service.ts',
  'services/crud-projection.ts',
  'services/crud-scope.ts',
  'services/merge-patch.ts',
  'services/service-hooks.ts',
  'filters/filter-query.helper.ts'
];
const jwt = { JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234', JWT_ISSUER: 'e2e', JWT_AUDIENCE: 'e2e' };
const adminId = '65f000000000000000000001';
let failed = 0;
let host;

function step(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

async function loadBundle() {
  // Inside the Generator tree: `getGeneratorRoot()` walks up from the bundle to find package.json.
  const outfile = join(root, 'scripts/verify/out/.harness/express-py1-bundle.mjs');
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, 'scripts/verify/_regen-entry.ts')],
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
            contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };',
            loader: 'js'
          }));
        }
      }
    ],
    logLevel: 'silent'
  });
  return import(pathToFileURL(outfile).href);
}

function prepareCopy() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const entry of ['src', 'tsconfig.json', 'package.json']) cpSync(join(varlik, entry), join(out, entry), { recursive: true });
  mkdirSync(join(out, '.generator'), { recursive: true });
  cpSync(join(root, 'scripts/verify/fixtures/varlik360.manifest.v3.json'), join(out, '.generator/manifest.json'));
  symlinkSync(join(varlik, 'node_modules'), join(out, 'node_modules'));
  for (const rel of CORE_OVERLAY) copyFileSync(join(assets, rel), join(out, 'src/core', rel));
  return CORE_OVERLAY.length;
}

async function generate() {
  const { generateBackend } = await loadBundle();
  const models = JSON.parse(readFileSync(join(root, 'scripts/verify/fixtures/dotnet/models.json'), 'utf8'));
  const reminders = models.find((m) => m.entityName === 'Reminders');
  const cwd = process.cwd();
  process.chdir(out); // generator logs land in the copy
  try {
    return generateBackend({ ...reminders, api: { ...reminders.api, normalOperations: [] } }, out, true, 'nodejs-mongoose', true, '/api', true, true, undefined);
  } finally {
    process.chdir(cwd);
  }
}

/** The generator mounted the admin router in `src/app.ts`, inside `createApp`, before `mountSwagger`. */
function mountedInApp() {
  const text = readFileSync(join(out, 'src/app.ts'), 'utf8');
  const use = text.indexOf("  app.use('/api/reminders/admin', remindersAdminRoutes);");
  return text.includes("import remindersAdminRoutes from '@modules/reminders/reminders.routes.admin';") && use !== -1 && use < text.indexOf('mountSwagger(app)');
}

async function waitFor(check, what, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${what}: zaman aşımı`);
}

async function runHost() {
  if (spawnSync('docker', ['info'], { encoding: 'utf8' }).status !== 0) {
    step('docker', false, 'Docker çalışmıyor (OrbStack açık mı?)');
    return;
  }
  spawnSync('docker', ['rm', '-f', 'gen-py1-mongo']);
  spawnSync('docker', ['run', '-d', '--name', 'gen-py1-mongo', '-p', '27029:27017', 'mongo:7'], { encoding: 'utf8' });
  // Outside the Generator tree ("type": "module" would load host.ts as ESM instead of through ts-node).
  const cwd = mkdtempSync(join(tmpdir(), 'gen-py1-express-'));
  copyFileSync(join(root, 'scripts/verify/fixtures/express-parity-host.ts'), join(cwd, 'host.ts'));
  let output = '';
  host = spawn(
    'node',
    ['-r', join(varlik, 'node_modules/ts-node/register'), '-r', join(varlik, 'node_modules/tsconfig-paths/register'), join(cwd, 'host.ts')],
    {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PORT: '5194',
        MONGODB_URI: 'mongodb://localhost:27029/py1',
        JWT_SECRET: jwt.JWT_SECRET,
        ADMIN_USER_IDS: adminId,
        ISPRODUCTION: 'false',
        MAIL_SERVICE_ENABLED: 'false',
        TS_NODE_PROJECT: join(out, 'tsconfig.json'),
        TS_NODE_TRANSPILE_ONLY: 'true'
      }
    }
  );
  host.stdout.on('data', (d) => (output += d));
  host.stderr.on('data', (d) => (output += d));
  try {
    await waitFor(() => output.includes('express parity host ready'), 'Express host', 90000);
  } catch (error) {
    step('express host', false, `${error.message}\n${output.slice(-2000)}`);
    return;
  }
  await new Promise((r) => setTimeout(r, 2000)); // indexes after connect
  const r = spawnSync('node', [join(root, 'scripts/verify/dotnet-py1-formats-smoke.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, ...jwt, API_BASE: 'http://localhost:5194', TOKEN_USER_ID: adminId }
  });
  const lines = r.stdout.trim().split('\n');
  for (const l of lines.filter((x) => x.startsWith('FAIL'))) console.log(`      ${l}`);
  step('py1 formats smoke (Express)', r.status === 0, `${lines.filter((l) => l.startsWith('PASS')).length} PASS${r.stderr ? `\n${r.stderr}` : ''}`);
  rmSync(cwd, { recursive: true, force: true });
}

try {
  const overlaid = prepareCopy();
  step('copy + core assets', overlaid > 0, `${overlaid} asset`);
  const gen = await generate();
  step('generate Reminders', gen.success, gen.error ?? '');
  step('admin route mounted in src/app.ts', mountedInApp());
  const tsc = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: out, encoding: 'utf8' });
  const errors = `${tsc.stdout}${tsc.stderr}`.split('\n').filter((l) => l.includes('error TS'));
  step('tsc in copy', errors.length === 0, errors.slice(0, 10).join('\n'));
  if (gen.success) await runHost();
} catch (error) {
  step('e2e', false, error instanceof Error ? error.stack : String(error));
} finally {
  if (host && host.exitCode === null) host.kill('SIGKILL');
  spawnSync('docker', ['rm', '-f', 'gen-py1-mongo']);
  if (!keep) rmSync(out, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);

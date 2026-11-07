#!/usr/bin/env node
/**
 * Express + Mongoose new-host gate (plan backend-python-fastapi PY9).
 *
 * In `out/express-bootstrap/` (removed at the end; kept on failure or with --keep):
 *  1. The app's `bootstrapExpressProject` (IPC `project:bootstrapExpress`): skeleton + core assets, manifest
 *     `backendStack: nodejs-mongoose`, no token left; a second bootstrap is refused and writes nothing; bad name refused;
 *     the scan sees `nodejs-mongoose` with no model.
 *  2. `npm install` → `npm run typecheck` (0 errors) → `npm test` (skeleton tests, no Mongo).
 *  3. First model the app's way: `createModel` (model editor) → `loadModelForEditor` (schema designer) → api settings
 *     (normal list / getOne, admin) → `generateBackend` with "update existing files": base URL `/api`, normal and admin
 *     routers mounted in `src/app.ts` before the 404 handler; a second generate mounts nothing twice.
 *  4. `npm run typecheck`, `npm test`, `npm run build` (tsc + tsc-alias) with the module.
 *     The bootstrap also lays down the shared auth layer (docs/backend/auth.md): every module, a first admin, and the
 *     `Users` model generated (manifest row, admin router mounted).
 *  5. Docker `mongo:7` + `node dist/index.js`: health (`mongoConnected: true`), the first admin seeded, 401
 *     envelopes, normal list without auth, `dotnet-py1-formats-smoke.mjs` (the scenarios .NET and Varlik360 pass) on
 *     the new module with the admin's login token, then the shared auth scenarios (`auth-scenarios.mjs`).
 *  6. Stack info (`src/shared/backendStacks.ts`, the buttons' popover): for .NET, Express and Python every tree entry
 *     marked `bootstrap` exists right after that stack's bootstrap; doc files exist; versions in the info match the
 *     skeletons (Express / Mongoose / Zod / TypeScript majors, Python `requires-python`, .NET SDK).
 *
 * Needs npm (registry or cache) and Docker (OrbStack) for step 5 (`--no-docker` skips it).
 *
 *   node scripts/verify/express-bootstrap.mjs [--keep] [--no-docker]
 */
import { build } from 'esbuild';
import { spawn, spawnSync } from 'child_process';
import { createHmac } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { AUTH_ALL_MODULES, AUTH_TEST_ADMIN, otpReaderFromLog, runAuthScenarios } from './auth-scenarios.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const keep = process.argv.includes('--keep');
const withDocker = !process.argv.includes('--no-docker');
const out = join(root, 'scripts/verify/out/express-bootstrap');
const host = join(out, 'host');
const appName = 'SampleShop';
const jwt = { JWT_SECRET: 'express-bootstrap-secret-0123456789abcdef', JWT_ISSUER: 'gen-e2e', JWT_AUDIENCE: 'gen-e2e' };
const PORT = 5196;
const MONGO_PORT = 27031;
const MONGO = 'gen-express-bootstrap-mongo';
const AUTH = { modules: AUTH_ALL_MODULES, admin: AUTH_TEST_ADMIN };

let failed = 0;
let server;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
  return ok;
}

async function loadBundle() {
  const outfile = join(root, 'scripts/verify/out/.harness/express-bundle.mjs');
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, 'scripts/verify/_express-entry.ts')],
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

function listFiles(dir, skip = new Set(['node_modules', 'dist', '.git', 'system'])) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...listFiles(full, skip));
    else files.push(full);
  }
  return files;
}

function run(cmd, args, cwd, extraEnv = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...extraEnv } });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const tail = (text, n = 25) => `\n${text.trim().split('\n').slice(-n).join('\n')}`;

function token(claims) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iat: now, exp: now + 600, iss: jwt.JWT_ISSUER, aud: jwt.JWT_AUDIENCE, ...claims })}`;
  return `${head}.${createHmac('sha256', jwt.JWT_SECRET).update(head).digest('base64url')}`;
}

async function call(method, path, { body, auth } = {}) {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function waitFor(check, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function bootstrapStep(api) {
  const result = await api.bootstrapExpressProject(host, appName, AUTH);
  check('bootstrapExpressProject', result.success && result.package === 'sample-shop', result.error ?? `${result.files?.length} dosya, paket ${result.package}`);
  const manifest = api.readWorkspaceManifest(host);
  check('manifest backendStack nodejs-mongoose', manifest?.workspace?.backendStack === 'nodejs-mongoose', JSON.stringify(manifest?.workspace));
  check('manifest auth modules + Users row', manifest?.workspace?.auth?.modules?.length === AUTH_ALL_MODULES.length && manifest.models.some((m) => m.model.entityName === 'Users'), JSON.stringify(manifest?.workspace?.auth));
  check('first admin seed: hash only', /\$2b\$12\$/.test(readFileSync(join(host, 'src/seed/initial-admin.ts'), 'utf8')) && !readFileSync(join(host, 'src/seed/initial-admin.ts'), 'utf8').includes(AUTH_TEST_ADMIN.password));
  check('auth module files', ['src/modules/auth/auth.routes.ts', 'src/core/auth/social.ts', 'src/core/auth/otp.ts'].every((f) => existsSync(join(host, f))));
  const tokens = listFiles(host).filter((f) => /__app__|__App__/.test(readFileSync(f, 'utf8')) || /__app__|__App__/.test(f));
  check('no skeleton token left', tokens.length === 0, tokens.join(', '));
  const pkg = JSON.parse(readFileSync(join(host, 'package.json'), 'utf8'));
  check('package.json name', pkg.name === 'sample-shop', pkg.name);
  const again = await api.bootstrapExpressProject(host, appName, AUTH);
  check('second bootstrap refused', !again.success && /package\.json/.test(again.error ?? ''), again.error);
  const rewrite = api.bootstrapExpressHost(host, appName, 'sample-shop').files.filter((f) => f.action === 'created');
  check('second host bootstrap writes nothing', rewrite.length === 0, rewrite.map((f) => f.path).join(', '));
  const bad = await api.bootstrapExpressProject(mkdtempSync(join(tmpdir(), 'gen-express-bad-')), '123', AUTH);
  check('invalid app name refused', !bad.success, bad.error);
  const scan = await api.scanProject(host);
  check('scan: nodejs-mongoose, only Users', scan.success && scan.detectedType === 'nodejs-mongoose' && scan.models.length === 1, JSON.stringify({ type: scan.detectedType, models: scan.models?.length, error: scan.error }));
}

function npmChecks(label) {
  const tsc = run('npm', ['run', '--silent', 'typecheck'], host);
  const errors = tsc.output.split('\n').filter((l) => l.includes('error TS'));
  check(`${label}: typecheck`, tsc.ok && errors.length === 0, errors.length ? errors.slice(0, 10).join('\n') : tsc.ok ? '' : tail(tsc.output));
  const test = run('npm', ['test'], host);
  const pass = /(?:#|ℹ) pass (\d+)/.exec(test.output)?.[1];
  const fail = /(?:#|ℹ) fail (\d+)/.exec(test.output)?.[1];
  check(`${label}: npm test`, test.ok && fail === '0', `pass ${pass ?? '?'}, fail ${fail ?? '?'}${test.ok ? '' : tail(test.output)}`);
}

async function modelStep(api) {
  const models = JSON.parse(readFileSync(join(root, 'scripts/verify/fixtures/dotnet/models.json'), 'utf8'));
  const reminders = models.find((m) => m.entityName === 'Reminders');
  const draft = { model: { ...reminders, fields: reminders.fields.filter((f) => f.name !== 'createdAt' && f.name !== 'updatedAt') } };
  const created = await api.createModel(host, 'nodejs-mongoose', draft);
  check('model editor: createModel', created.success, created.error ?? created.filePath);
  if (!created.success) return false;
  const loaded = api.loadModelForEditor(created.filePath, host, 'nodejs-mongoose');
  check('schema designer: loadModelForEditor', loaded.success, loaded.error ?? `${loaded.model?.fields.length} alan`);
  if (!loaded.success) return false;
  const schema = { ...loaded.model, api: { normalOperations: ['list', 'getOne'], requiresAuth: false, admin: true } };
  const baseUrl = api.parseBaseUrlFromBackend(host);
  check('base URL from src/app.ts', baseUrl === '/api', baseUrl);
  const cwd = process.cwd();
  process.chdir(host); // generator logs land in the host (gitignored there)
  let gen;
  let second;
  try {
    gen = api.generateBackend(schema, host, false, 'nodejs-mongoose', true, undefined, true, true, undefined);
    second = api.generateBackend(schema, host, false, 'nodejs-mongoose', true, undefined, true, true, undefined);
  } finally {
    process.chdir(cwd);
  }
  check('generateBackend Reminders', gen.success, gen.error ?? Object.keys(gen.files ?? {}).join(', '));
  check('second generate', second.success, second.error ?? '');
  const app = readFileSync(join(host, 'src/app.ts'), 'utf8');
  const count = (s) => app.split(s).length - 1;
  const admin = "app.use('/api/reminders/admin', remindersAdminRoutes);";
  const normal = "app.use('/api/reminders', remindersRoute);";
  check(
    'routers mounted once in src/app.ts, before the 404 handler',
    count(admin) === 1 && count(normal) === 1 && app.indexOf(admin) < app.indexOf('app.use(notFoundHandler)') &&
      app.includes("import remindersAdminRoutes from '@modules/reminders/reminders.routes.admin';"),
    `admin ×${count(admin)}, normal ×${count(normal)}`
  );
  check('admin mount path read back', api.findAdminMountPath(host, 'reminders') === '/api/reminders/admin', api.findAdminMountPath(host, 'reminders'));
  const scan = await api.scanProject(host);
  check('scan: Users + the new model', scan.models?.length === 2, scan.models?.map((m) => m.fileName).join(', '));
  return gen.success;
}

async function httpStep() {
  if (spawnSync('docker', ['info'], { encoding: 'utf8' }).status !== 0) {
    check('docker', false, 'Docker çalışmıyor (OrbStack açık mı?)');
    return;
  }
  spawnSync('docker', ['rm', '-f', MONGO]);
  const started = spawnSync('docker', ['run', '-d', '--name', MONGO, '-p', `${MONGO_PORT}:27017`, 'mongo:7'], { encoding: 'utf8' });
  if (!check('mongo:7 container', started.status === 0, started.stderr)) return;
  let output = '';
  server = spawn('node', ['dist/index.js'], {
    cwd: host,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'development',
      PORT: String(PORT),
      MONGODB_URI: `mongodb://localhost:${MONGO_PORT}/express_bootstrap`,
      LOG_LEVEL: 'info',
      ...jwt
    }
  });
  server.stdout.on('data', (d) => (output += d));
  server.stderr.on('data', (d) => (output += d));
  const up = await waitFor(async () => (await call('GET', '/api/health')).json?.data?.mongoConnected === true, 60000);
  if (!check('node dist/index.js: health, mongoConnected', up, up ? '' : tail(output))) return;
  const health = await call('GET', '/api/health');
  check('health envelope', health.status === 200 && health.json.isSuccess === true && health.json.errorData === null && typeof health.json.traceId === 'string');
  const anon = await call('POST', '/api/reminders/admin/get-all', { body: {} });
  check('admin without token → 401 envelope', anon.status === 401 && anon.json?.errorData?.code === 401, JSON.stringify(anon.json));
  const forged = await call('POST', '/api/reminders/admin/get-all', { body: {}, auth: token({ sub: '0123456789abcdef01234567', role: 'admin' }) });
  check('signed admin claim of an unknown user → 401 (role read from the DB)', forged.status === 401, JSON.stringify(forged.json));
  const wrongIssuer = await call('POST', '/api/reminders/admin/get-all', { body: {}, auth: token({ sub: 'u1', role: 'admin', iss: 'other' }) });
  check('wrong issuer → 401', wrongIssuer.status === 401);
  const seeded = await waitFor(async () => output.includes('auth.seed'), 15000);
  const login = await call('POST', '/api/auth/login', { body: { email: AUTH_TEST_ADMIN.email, password: AUTH_TEST_ADMIN.password } });
  if (!check('first admin seeded and logs in', seeded && login.status === 200 && login.json?.data?.accessToken, JSON.stringify(login.json)?.slice(0, 300))) return;
  const smoke = spawnSync('node', [join(root, 'scripts/verify/dotnet-py1-formats-smoke.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, ...jwt, API_BASE: `http://localhost:${PORT}`, ACCESS_TOKEN: login.json.data.accessToken }
  });
  const lines = smoke.stdout.trim().split('\n');
  // KNOWN: `numberFormat` is a C# / Python choice; the Express model editor hides it and the Mongoose model file does
  // not carry it (src/shared/modelDraft.ts), so a model made in the editor has a plain number and accepts 1.5.
  const known = (l) => l.startsWith('FAIL int: fraction');
  const fails = lines.filter((x) => x.startsWith('FAIL'));
  for (const l of fails) console.log(`      ${known(l) ? 'KNOWN' : 'FAIL '} ${l.slice(5)}`);
  const pass = lines.filter((l) => l.startsWith('PASS')).length;
  const unknown = fails.filter((l) => !known(l));
  check('py1 formats smoke (new Express host)', unknown.length === 0 && pass > 0, `${pass} PASS, ${fails.length - unknown.length} KNOWN${smoke.stderr ? `\n${smoke.stderr}` : ''}`);
  const normal = await call('POST', '/api/reminders/get-all', { body: {} });
  check('normal list without auth (requiresAuth false)', normal.status === 200 && normal.json?.data?.total >= 2, JSON.stringify(normal.json).slice(0, 300));
  await runAuthScenarios({
    base: `http://localhost:${PORT}`,
    prefix: '/api',
    admin: AUTH_TEST_ADMIN,
    usersAdmin: '/api/users/admin',
    modules: AUTH_ALL_MODULES,
    readOtp: otpReaderFromLog(() => output),
    check
  });
}

async function stackInfoStep(api, expressHost) {
  const majors = JSON.parse(readFileSync(join(host, 'package.json'), 'utf8'));
  const deps = { ...majors.dependencies, ...majors.devDependencies };
  const scratch = mkdtempSync(join(tmpdir(), 'gen-stack-info-'));
  try {
    for (const info of api.NEW_PROJECT_STACKS) {
      let target = expressHost;
      let names = { app: appName, pkg: 'sample-shop' };
      if (info.stack === 'dotnet-ef') {
        target = join(scratch, 'dotnet');
        names = { app: 'StackInfo', pkg: '' };
        const r = await api.bootstrapDotnetProject(target, names.app, { database: 'postgres', idType: 'uuid-v7' }, AUTH);
        check('stack info: .NET bootstrap', r.success, r.error ?? '');
      } else if (info.stack === 'python-fastapi') {
        target = join(scratch, 'python');
        names = { app: 'StackInfo', pkg: api.toPythonPackageName('StackInfo') };
        const r = await api.bootstrapPythonProject(target, names.app, AUTH);
        check('stack info: Python bootstrap', r.success, r.error ?? '');
      }
      const paths = api.stackTreePaths(info, names);
      const missing = paths.filter((p) => !existsSync(join(target, p)));
      check(`stack info ${info.stack}: ${paths.length} bootstrap entries exist`, missing.length === 0, missing.join(', '));
      check(`stack info ${info.stack}: doc exists`, existsSync(join(root, info.doc)), info.doc);
      const tech = Object.fromEntries(info.technologies.map((t) => [t.label, t.value]));
      check(`stack info ${info.stack}: database row from the list`, tech['Veritabanı'] === info.databases.join(' / '), tech['Veritabanı']);
      if (info.stack === 'nodejs-mongoose') {
        const major = (name) => deps[name]?.replace(/^[\^~]/, '').split('.')[0];
        const ok =
          tech['Framework'] === `Express ${major('express')}` &&
          tech['ORM / sürücü'] === `Mongoose ${major('mongoose')}` &&
          tech['Doğrulama'] === `Zod ${major('zod')}` &&
          tech['Dil'].startsWith(`TypeScript ${deps.typescript.split('.').slice(0, 2).join('.')}`) &&
          tech['Dil'].includes(`Node.js ${majors.engines.node.replace('>=', '')}+`);
        check('stack info Express: versions = skeleton package.json', ok, JSON.stringify(tech));
      } else if (info.stack === 'python-fastapi') {
        const pyproject = readFileSync(join(target, 'pyproject.toml'), 'utf8');
        const min = /requires-python = ">=([\d.]+)"/.exec(pyproject)?.[1];
        check('stack info Python: version = pyproject requires-python', tech['Dil'] === `Python ${min}+`, `${tech['Dil']} / ${min}`);
      } else {
        const sdk = JSON.parse(readFileSync(join(target, 'global.json'), 'utf8')).sdk.version;
        check('stack info .NET: SDK = global.json', tech['Dil'].includes(`SDK ${sdk}`) && tech['Dil'].includes(`.NET ${sdk.split('.')[0]}`), `${tech['Dil']} / ${sdk}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(host, { recursive: true });
  const api = await loadBundle();
  await bootstrapStep(api);
  await stackInfoStep(api, host);
  const install = run('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], host);
  check('npm install', install.ok, install.ok ? '' : tail(install.output));
  if (install.ok) {
    npmChecks('skeleton');
    if (await modelStep(api)) {
      npmChecks('with module');
      const built = run('npm', ['run', 'build'], host);
      check('npm run build (tsc + tsc-alias)', built.ok && existsSync(join(host, 'dist/index.js')), built.ok ? '' : tail(built.output));
      if (withDocker && built.ok) await httpStep();
    }
  }
} catch (error) {
  check('express-bootstrap', false, error instanceof Error ? error.stack : String(error));
} finally {
  if (server && server.exitCode === null) server.kill('SIGKILL');
  if (withDocker) spawnSync('docker', ['rm', '-f', MONGO]);
  if (!keep && !failed) rmSync(out, { recursive: true, force: true });
  else console.log(`\nhost: ${host}`);
}
console.log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);

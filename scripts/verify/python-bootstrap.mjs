/**
 * Python + FastAPI host gate (plan backend-python-fastapi PY4).
 *
 * In a temp folder (removed at the end; kept on failure or with --keep):
 *  - the app's `bootstrapPythonProject` (IPC `project:bootstrapPython`) → manifest `backendStack: python-fastapi`;
 *    a second `bootstrapPythonHost` writes nothing, a second `bootstrapPythonProject` is refused.
 *  - `uv sync` → import check (`api.main`, `worker.main`) → `ruff check` → `lint-imports` → skeleton `pytest`.
 *  - Auth (docs/backend/auth.md): `workspace.auth`, the `Users` manifest model, auth files, `seed/initial_admin.py`
 *    (bcrypt hash only).
 *  - `uvicorn` with Mongo unreachable: `/api/v1/health` 200, contract envelope, `X-Request-Id` echoed.
 *  - Docker `mongo:7` + `uvicorn`: first admin seeded, then `auth-scenarios.mjs` (`--no-docker` skips it).
 *  - Assets (`src/generator-assets/python-fastapi/core/**`) byte for byte = the host copy and = StockExchange
 *    (`src/alpha_terminal/core/**`); the skeleton's `tests/core/crud/test_crud.py` = StockExchange's; the registry
 *    rendered for `subscription_plans` = StockExchange's `api/routers_generated.py`.
 *
 * Run:  node scripts/verify/python-bootstrap.mjs [--keep] [--no-stockexchange] [--no-docker]
 *       STOCKEXCHANGE_ROOT overrides ~/Projects/VarlikALL/StockExchange.
 */
import { build } from 'esbuild';
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { createServer } from 'net';
import { homedir, tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { AUTH_ALL_MODULES, AUTH_TEST_ADMIN, otpReaderFromLog, runAuthScenarios } from './auth-scenarios.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const keep = process.argv.includes('--keep');
const withStockExchange = !process.argv.includes('--no-stockexchange');
const withDocker = !process.argv.includes('--no-docker');
const AUTH = { modules: AUTH_ALL_MODULES, admin: AUTH_TEST_ADMIN };
const stockExchange = process.env.STOCKEXCHANGE_ROOT ?? join(homedir(), 'Projects/VarlikALL/StockExchange');
const appName = 'SampleHost';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
  return ok;
}

async function loadBundle() {
  const outfile = join(root, 'scripts/verify/out/.harness/python-bundle.mjs');
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, 'scripts/verify/_python-entry.ts')],
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

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === '__pycache__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

const hostEnv = (extra = {}) => {
  const env = { ...process.env, ...extra };
  delete env.VIRTUAL_ENV; // uv must use the host's own .venv
  return env;
};

function run(cwd, cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: hostEnv(extraEnv), timeout: 600_000 });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function tail(text, lines = 25) {
  return `\n${text.trim().split('\n').slice(-lines).join('\n')}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MONGO = 'gen-py-bootstrap-mongo';

async function liveAuthStep() {
  if (spawnSync('docker', ['info'], { encoding: 'utf8' }).status !== 0) {
    check('docker', false, 'Docker çalışmıyor (OrbStack açık mı?)');
    return;
  }
  const mongoPort = await freePort();
  spawnSync('docker', ['rm', '-f', MONGO]);
  const started = spawnSync('docker', ['run', '-d', '--name', MONGO, '-p', `${mongoPort}:27017`, 'mongo:7'], { encoding: 'utf8' });
  if (!check('docker: mongo:7 started', started.status === 0, tail(started.stderr ?? ''))) return;
  const port = await freePort();
  const server = spawn('uv', ['run', '--no-sync', 'uvicorn', `${pkg}.api.main:app`, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: host,
    env: hostEnv({ JWT_SECRET: 'gate-secret-0123456789abcdef0123456789abcdef', MONGO_URI: `mongodb://127.0.0.1:${mongoPort}`, MONGO_DB_NAME: 'gate', PYTHONUNBUFFERED: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  server.stdout.on('data', (d) => (output += d));
  server.stderr.on('data', (d) => (output += d));
  try {
    let seeded = false;
    for (let i = 0; i < 120 && !seeded; i++) {
      await sleep(250);
      seeded = output.includes(`auth.seed ${AUTH_TEST_ADMIN.email}`);
    }
    if (!check('live: first admin seeded', seeded, tail(output))) return;
    await runAuthScenarios({
      base: `http://127.0.0.1:${port}`,
      prefix: '/api/v1',
      admin: AUTH_TEST_ADMIN,
      usersAdmin: '/api/v1/admin-crud/users',
      modules: AUTH_ALL_MODULES,
      readOtp: otpReaderFromLog(() => output),
      check
    });
  } finally {
    server.kill('SIGTERM');
  }
}

const gen = await loadBundle();
const host = mkdtempSync(join(tmpdir(), 'py-bootstrap-'));
const pkg = gen.toPythonPackageName(appName);

try {
  // 1. Bootstrap through the app's function.
  check('package name', pkg === 'sample_host' && gen.isValidPythonPackage(pkg) && !gen.isValidPythonPackage('class'), pkg);
  const boot = await gen.bootstrapPythonProject(host, appName, AUTH);
  const assetFiles = listFiles(join(gen.pythonAssetsDir(), 'core'));
  const skeletonFiles = listFiles(join(gen.pythonAssetsDir(), '_skeleton'));
  // Skeleton + core assets + the two G registries (`api/routers_generated.py`, `api/indexes_generated.py`).
  const hostFiles = assetFiles.length + skeletonFiles.length + 2;
  const written = new Set(boot.files ?? []);
  check('bootstrap: files created', boot.success && written.size > hostFiles, boot.error ?? `${written.size} (host ${hostFiles})`);
  check('bootstrap: manifest backendStack', gen.readWorkspaceManifest(host)?.workspace?.backendStack === 'python-fastapi');
  const ws = gen.readWorkspaceManifest(host)?.workspace;
  check('bootstrap: manifest database + id type', ws?.database === 'mongodb' && ws?.idType === 'objectid', JSON.stringify(ws));
  check('auth: workspace.auth modules', JSON.stringify(ws?.auth?.modules) === JSON.stringify(AUTH_ALL_MODULES), JSON.stringify(ws?.auth));
  const models = gen.readWorkspaceManifest(host)?.models ?? [];
  check('auth: Users is the only manifest model', models.length === 1 && models[0].model.entityName === 'Users', models.map((m) => m.model.entityName).join(', '));
  const authFiles = ['core/auth/tokens.py', 'core/auth/passwords.py', 'core/auth/otp.py', 'core/auth/social.py', 'modules/auth/router.py', 'modules/auth/service.py', 'modules/auth/seed.py', 'modules/users/admin_router_generated.py'];
  const missingAuth = authFiles.filter((f) => !existsSync(join(host, 'src', pkg, f)));
  check('auth: files written', missingAuth.length === 0, missingAuth.join(', '));
  const seed = readFileSync(join(host, 'src', pkg, 'seed/initial_admin.py'), 'utf8');
  check('auth: first admin seed is hash only', /\$2b\$12\$/.test(seed) && seed.includes(AUTH_TEST_ADMIN.email) && !seed.includes(AUTH_TEST_ADMIN.password));
  check('auth: PyJWT[crypto] for social login', readFileSync(join(host, 'pyproject.toml'), 'utf8').includes('"PyJWT[crypto]'));
  check('auth: no ADMIN_ROLE left', !/ADMIN_ROLE/.test(readFileSync(join(host, '.env.example'), 'utf8') + readFileSync(join(host, 'src', pkg, 'core/config.py'), 'utf8')));
  check('bootstrap: registries are G', ['routers_generated.py', 'indexes_generated.py'].every((f) => readFileSync(join(host, 'src', pkg, 'api', f), 'utf8').startsWith('# <auto-generated by Generator />\n')));
  const leftovers = listFiles(host).filter((f) => /__app(_dist)?__|__App__/.test(relative(host, f)) || /__app(_dist)?__|__App__/.test(readFileSync(f, 'utf8')));
  check('bootstrap: no tokens left', leftovers.length === 0, leftovers.map((f) => relative(host, f)).join(', '));
  const markers = listFiles(host).filter((f) => /^\s*# @(if|else|endif|auth-file)\b/m.test(readFileSync(f, 'utf8')));
  check('auth: no module markers left', markers.length === 0, markers.map((f) => relative(host, f)).join(', '));

  // 2. Second run writes nothing (skeleton + assets; the registries now list Users and stay as they are).
  const again = gen.ensurePythonHost(host, pkg);
  const rewritten = again.filter((f) => f.action === 'created' || f.action === 'updated');
  check('second bootstrap writes nothing', rewritten.length === 0 && again.length === hostFiles - 2, rewritten.map((f) => relative(host, f.path)).join(', '));
  const refused = await gen.bootstrapPythonProject(host, appName, AUTH);
  check('second bootstrapPythonProject refused', !refused.success, refused.error ?? '');

  // 3. uv sync, imports, lint, tests.
  const sync = run(host, 'uv', ['sync', '--quiet']);
  check('uv sync', sync.ok, sync.ok ? '' : tail(sync.output));
  check('uv.lock written', existsSync(join(host, 'uv.lock')));
  const imp = run(host, 'uv', ['run', '--no-sync', 'python', '-c', `import ${pkg}.api.main, ${pkg}.worker.main`], { JWT_SECRET: '' });
  check('import api.main + worker.main', imp.ok, imp.ok ? '' : tail(imp.output));
  const ruff = run(host, 'uv', ['run', '--no-sync', 'ruff', 'check', 'src', 'tests']);
  check('ruff check', ruff.ok, ruff.ok ? '' : tail(ruff.output, 40));
  const li = run(host, 'uv', ['run', '--no-sync', 'lint-imports']);
  check('lint-imports', li.ok, li.ok ? /Contracts: .*/.exec(li.output)?.[0] ?? '' : tail(li.output));
  const tests = run(host, 'uv', ['run', '--no-sync', 'pytest', '-q', '-p', 'no:cacheprovider']);
  check('pytest', tests.ok, /\d+ passed[^\n]*/.exec(tests.output)?.[0] ?? tail(tests.output, 40));

  // 4. uvicorn + health.
  const port = await freePort();
  const server = spawn('uv', ['run', '--no-sync', 'uvicorn', `${pkg}.api.main:app`, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: host,
    env: hostEnv({
      JWT_SECRET: 'gate-secret-0123456789abcdef0123456789abcdef',
      MONGO_URI: 'mongodb://127.0.0.1:9',
      MONGO_CONNECT_TIMEOUT_MS: '300',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '300'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));
  try {
    let resp;
    for (let i = 0; i < 60 && !resp; i++) {
      try {
        resp = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { headers: { 'X-Request-Id': 'gate-trace-1' } });
      } catch {
        await sleep(250);
      }
    }
    check('uvicorn: health 200', resp?.status === 200, resp ? `status=${resp.status}` : tail(serverLog));
    if (resp) {
      const body = await resp.json();
      const keys = Object.keys(body).sort().join(',');
      check('health: envelope', keys === 'data,errorData,isSuccess,traceId,uiMessage' && body.isSuccess === true && body.errorData === null, keys);
      check('health: data', body.data?.status === 'ok' && body.data?.mongoConnected === false, JSON.stringify(body.data));
      check('health: X-Request-Id echoed', body.traceId === 'gate-trace-1' && resp.headers.get('x-request-id') === 'gate-trace-1' && resp.headers.get('x-trace-id') === 'gate-trace-1');
      const fresh = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      const freshId = fresh.headers.get('x-request-id');
      check('health: new trace id when none sent', !!freshId && (await fresh.json()).traceId === freshId, freshId ?? '');
    }
  } finally {
    server.kill('SIGTERM');
  }

  // 5. Live Mongo: first admin seeded, then the shared auth scenarios.
  if (withDocker) await liveAuthStep();
  else console.log('SKIP  live auth scenarios (--no-docker)');

  // 6. Asset parity: Generator asset = host copy = StockExchange.
  const coreDir = join(gen.pythonAssetsDir(), 'core');
  const hostDiff = assetFiles.filter((f) => !readFileSync(join(host, 'src', pkg, 'core', relative(coreDir, f))).equals(readFileSync(f)));
  check(`assets: host copy byte-identical (${assetFiles.length})`, hostDiff.length === 0, hostDiff.map((f) => relative(coreDir, f)).join(', '));
  if (withStockExchange) {
    const seCore = join(stockExchange, 'src/alpha_terminal/core');
    if (!existsSync(seCore)) {
      check('StockExchange present', false, `${seCore} (use --no-stockexchange to skip)`);
    } else {
      const seDiff = assetFiles.filter((f) => {
        const target = join(seCore, relative(coreDir, f));
        return !existsSync(target) || !readFileSync(target).equals(readFileSync(f));
      });
      check(`assets: StockExchange byte-identical (${assetFiles.length})`, seDiff.length === 0, seDiff.map((f) => relative(coreDir, f)).join(', '));
      const skeletonTest = readFileSync(join(gen.pythonAssetsDir(), '_skeleton/tests/core/crud/test_crud.py'), 'utf8').split('__app__').join('alpha_terminal');
      check('skeleton test_crud.py = StockExchange', skeletonTest === readFileSync(join(stockExchange, 'tests/core/crud/test_crud.py'), 'utf8'));
      // StockExchange's registry lists every module in its manifest (PY-R imports them one by one).
      const seManifest = gen.readWorkspaceManifest(stockExchange)?.models ?? [];
      const registry = gen.renderRoutersRegistry(
        'alpha_terminal',
        seManifest.map((m) => ({ folder: gen.pythonModuleNames(m.model.entityName).folder, hasAdmin: m.model.api?.admin !== false }))
      );
      check('registry render = StockExchange routers_generated.py', registry === readFileSync(join(stockExchange, 'src/alpha_terminal/api/routers_generated.py'), 'utf8'));
    }
  } else {
    console.log('SKIP  StockExchange parity (--no-stockexchange)');
  }
} finally {
  if (withDocker) spawnSync('docker', ['rm', '-f', MONGO]);
  if (failed || keep) console.log(`host kept: ${host}`);
  else rmSync(host, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks PASS');
process.exit(failed ? 1 : 0);

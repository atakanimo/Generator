#!/usr/bin/env node
/**
 * .NET EF Core end-to-end gate (plan backend-dotnet-efcore §8): runs generated hosts against real databases.
 *
 *  1. `regen-dotnet.mjs <label>` (build, idempotency, parser round trip, app flow, admin config).
 *  2. Smoke: `out/dotnet/<label>/models` → fresh Postgres DB → `dotnet ef migrations add` + `database update` →
 *     `dotnet run` → dotnet-d2 / d3 / d4 / py1-formats smokes (need empty tables, run first) → dotnet-d0-smoke (event-types).
 *  3. Parity (skip with --no-parity): Mongo in Docker (`mongo:7`) + Varlik360's HTTP app
 *     (`fixtures/express-parity-host.ts`) vs the golden host on Postgres → `contract-parity.mjs`.
 *  4. Python parity (backend-python-fastapi PY3): StockExchange's API (`uv run`, same Mongo container, `alpha_parity`)
 *     vs the `python-parity` host on Postgres → `contract-parity.mjs --suite subscription-plans`.
 *     Skipped with a FAIL line when StockExchange (`STOCKEXCHANGE`) is missing.
 *  5. Python golden parity (PY6): a Python host generated from `fixtures/dotnet/models.json` (`out/dotnet/<label>/
 *     python-golden`, empty Mongo DB `py_golden` in the same container; StockExchange untouched) vs the `models/` host
 *     on a fresh Postgres DB → `contract-parity.mjs --suite golden-models`. `--python-only` runs steps 4 and 5 only.
 *
 * `--db sqlserver`: the .NET hosts run on SQL Server instead (Docker `mcr.microsoft.com/mssql/server:2022-latest`,
 * amd64; a fresh container per run, removed at the end); regen-dotnet gets the same flag. `--db mongodb`: a separate
 * `mongo:7` container for the .NET hosts (no migrations; indexes at startup).
 *
 * Needs: dotnet 10 SDK, a local Postgres reachable as `PG_HOST` (default /tmp socket) by the current user with
 * `createdb` rights (Postgres runs), and for parity / SQL Server Docker (OrbStack) + Varlik360 checked out with
 * node_modules + StockExchange with uv.
 *
 * `--id objectid` (MongoDB only): hosts with ObjectId ids; the smokes get `ID_TYPE` (`_smoke-ids.mjs`).
 *
 * Run:  node scripts/verify/dotnet-e2e.mjs [label] [--db postgres|sqlserver|mongodb] [--id uuid-v7|objectid] [--no-parity] [--skip-regen] [--parity-only] [--python-only]
 */
import { build } from 'esbuild';
import { spawn, spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir, userInfo } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const optionValues = new Set(['--db', '--id'].filter((n) => args.includes(n)).map((n) => args.indexOf(n) + 1));
const database = option('--db', 'postgres');
const idType = option('--id', 'uuid-v7');
const label = args.find((a, i) => !a.startsWith('--') && !optionValues.has(i)) ?? 'reference';
const parity = !args.includes('--no-parity');
const outBase = join(root, 'scripts/verify/out/dotnet', label);
const varlik = process.env.VARLIK360 ?? '/Users/atakanatabey/Projects/VarlikALL/Varlik360';
const stockExchange = process.env.STOCKEXCHANGE ?? '/Users/atakanatabey/Projects/VarlikALL/StockExchange';
const pythonOnly = args.includes('--python-only');
const pythonJwtSecret = 'parity-secret-parity-secret-parity-1234';
const pgHost = process.env.PG_HOST ?? '/tmp';
const pgUser = process.env.PG_USER ?? userInfo().username;

const jwt = { JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234', JWT_ISSUER: 'e2e', JWT_AUDIENCE: 'e2e' };
const children = [];
let failed = 0;

function log(line) {
  console.log(line);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', ...opts, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', ...opts.env } });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed:\n${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 4000));
  }
  return r;
}

function step(name, ok, detail = '') {
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
}

function start(name, cmd, cmdArgs, opts) {
  const child = spawn(cmd, cmdArgs, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  children.push(child);
  return { child, output: () => output, name };
}

async function waitFor(check, what, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if (await check()) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${what}`);
}

const mssql = { container: 'gen-e2e-mssql', port: 14330, password: 'E2e-Strong-Passw0rd!' };
const dotnetMongo = { container: 'gen-e2e-mongo-dotnet', port: 27030 };

/** Per database: server start (once), an empty database's connection string, cleanup. */
const DATABASES = {
  postgres: {
    migrations: true,
    async start() {},
    create(db) {
      run('psql', ['-h', pgHost, '-d', 'postgres', '-qc', `drop database if exists ${db}`, '-c', `create database ${db}`]);
      return `Host=${pgHost};Database=${db};Username=${pgUser}`;
    },
    stop(dbs) {
      for (const db of dbs) spawnSync('psql', ['-h', pgHost, '-d', 'postgres', '-qc', `drop database if exists ${db} with (force)`]);
    }
  },
  sqlserver: {
    migrations: true,
    async start() {
      run('docker', ['rm', '-f', mssql.container], { allowFail: true });
      run('docker', ['run', '-d', '--platform', 'linux/amd64', '--name', mssql.container, '-e', 'ACCEPT_EULA=Y', '-e', `MSSQL_SA_PASSWORD=${mssql.password}`,
        '-p', `${mssql.port}:1433`, 'mcr.microsoft.com/mssql/server:2022-latest']);
      const sqlcmd = ['exec', mssql.container, '/opt/mssql-tools18/bin/sqlcmd', '-C', '-S', 'localhost', '-U', 'sa', '-P', mssql.password, '-Q', 'SELECT 1'];
      await waitFor(async () => run('docker', sqlcmd, { allowFail: true }).status === 0, 'SQL Server container', 180000);
    },
    // Fresh container per run and a different name per host: `dotnet ef database update` creates the database.
    create: (db) => `Server=localhost,${mssql.port};Database=${db};User Id=sa;Password=${mssql.password};TrustServerCertificate=True`,
    stop() {
      spawnSync('docker', ['rm', '-f', mssql.container]);
    }
  },
  mongodb: {
    migrations: false,
    async start() {
      run('docker', ['rm', '-f', dotnetMongo.container], { allowFail: true });
      run('docker', ['run', '-d', '--name', dotnetMongo.container, '-p', `${dotnetMongo.port}:27017`, 'mongo:7']);
      const ping = ['exec', dotnetMongo.container, 'mongosh', '--quiet', '--eval', 'db.runCommand({ ping: 1 }).ok'];
      await waitFor(async () => run('docker', ping, { allowFail: true }).status === 0, 'MongoDB container (.NET hosts)', 60000);
    },
    create: (db) => `mongodb://localhost:${dotnetMongo.port}/${db}`,
    stop() {
      spawnSync('docker', ['rm', '-f', dotnetMongo.container]);
    }
  }
};
const dbServer = DATABASES[database];
if (!dbServer) throw new Error(`--db ${database}: postgres | sqlserver | mongodb`);

/** Fresh database + migration + `dotnet run` of a generated host. */
async function startDotnetHost(hostDir, db, port) {
  const connectionString = dbServer.create(db);
  rmSync(join(hostDir, 'src/SampleHost.Infrastructure/Persistence/Migrations'), { recursive: true, force: true });
  const env = {
    ConnectionStrings__Default: connectionString,
    Jwt__Secret: jwt.JWT_SECRET,
    Jwt__Issuer: jwt.JWT_ISSUER,
    Jwt__Audience: jwt.JWT_AUDIENCE,
    ASPNETCORE_URLS: `http://localhost:${port}`,
    // Started from the host root, so appsettings.json is not read: the schema step is switched on here (MongoDB).
    Database__EnsureIndexesOnStartup: 'true'
  };
  if (dbServer.migrations) {
    const ef = ['-p', 'src/SampleHost.Infrastructure', '-s', 'src/SampleHost.Api'];
    run('dotnet', ['tool', 'restore'], { cwd: hostDir });
    run('dotnet', ['ef', 'migrations', 'add', 'Initial', ...ef, '-o', 'Persistence/Migrations'], { cwd: hostDir, env });
    run('dotnet', ['ef', 'database', 'update', ...ef], { cwd: hostDir, env });
  }
  run('dotnet', ['build', '-nologo', '-v', 'q'], { cwd: hostDir });
  // The built dll, not `dotnet run`: `dotnet run` starts the app as its own child, which a kill would leave running.
  const host = start(`dotnet:${port}`, 'dotnet', ['src/SampleHost.Api/bin/Debug/net10.0/SampleHost.Api.dll'], {
    cwd: hostDir,
    env: { ...process.env, ...env, ASPNETCORE_ENVIRONMENT: 'Development' }
  });
  await waitFor(async () => (await fetch(`http://localhost:${port}/api/health`)).ok, `.NET host on ${port}`);
  return host;
}

/** Full scenario list of the last parity run (PASS / KNOWN / FAIL per scenario), next to the hosts. */
function writeParityLog(suite, stdout) {
  mkdirSync(outBase, { recursive: true });
  writeFileSync(join(outBase, `parity-${suite}.log`), stdout);
}

function smoke(script, base) {
  const r = run('node', [join(root, 'scripts/verify', script)], { env: { API_BASE: base, ID_TYPE: idType, ...jwt }, allowFail: true });
  const out = `${r.stdout}${r.stderr}`;
  const passes = (out.match(/^PASS/gm) ?? []).length;
  const fails = out.split('\n').filter((l) => /^FAIL/.test(l));
  step(`${script}`, r.status === 0, `${passes} PASS${fails.length ? `\n      ${fails.join('\n      ')}` : ''}`);
}

async function main() {
  const parityOnly = args.includes('--parity-only') || pythonOnly;
  // 1. Generate + static gates.
  if (!args.includes('--skip-regen') && !parityOnly) {
    const r = run('node', [join(root, 'scripts/verify/regen-dotnet.mjs'), label, '--db', database, '--id', idType], { allowFail: true });
    const passes = (r.stdout.match(/^PASS/gm) ?? []).length;
    step('regen-dotnet', r.status === 0, `${passes} PASS${r.status === 0 ? '' : `\n${r.stdout.split('\n').filter((l) => !/^PASS/.test(l)).join('\n')}`}`);
    if (r.status !== 0) return;
  }

  await dbServer.start();

  // 2. Smoke against the fixture host.
  if (!parityOnly) await smokes();

  // 3. Parity with Express.
  if (!parity) return;
  await parityRun();
}

async function smokes() {
  const modelsHost = await startDotnetHost(join(outBase, 'models'), 'gen_e2e_models', 5191);
  for (const script of ['dotnet-d2-documents-smoke.mjs', 'dotnet-d3-relations-smoke.mjs', 'dotnet-d4-ownership-smoke.mjs', 'dotnet-py1-formats-smoke.mjs', 'dotnet-d0-smoke.mjs']) {
    smoke(script, 'http://localhost:5191');
  }
  modelsHost.child.kill('SIGKILL');
}

async function parityRun() {
  if (run('docker', ['info'], { allowFail: true }).status !== 0) {
    step('parity: docker', false, 'Docker çalışmıyor (OrbStack açık mı?); --no-parity ile atlanabilir');
    return;
  }
  run('docker', ['rm', '-f', 'gen-e2e-mongo'], { allowFail: true });
  run('docker', ['run', '-d', '--name', 'gen-e2e-mongo', '-p', '27028:27017', 'mongo:7']);
  try {
    if (!pythonOnly) await expressParity();
    await pythonParity();
    await pythonGoldenParity();
  } finally {
    run('docker', ['rm', '-f', 'gen-e2e-mongo'], { allowFail: true });
  }
}

async function pythonParity() {
  if (!existsSync(join(stockExchange, 'pyproject.toml'))) {
    step('python parity: StockExchange', false, `${stockExchange} yok`);
    return;
  }
  // StockExchange reads config.env; the env below overrides what the parity host needs (no real DB, no rate limit).
  const env = {
    MONGO_URI: 'mongodb://localhost:27028',
    MONGO_DB_NAME: 'alpha_parity',
    JWT_SECRET: pythonJwtSecret,
    RATE_LIMIT_ENABLED: 'false',
    ENVIRONMENT: 'test'
  };
  // The project's venv python directly: `uv run` would start uvicorn as its own child, which a kill would leave running.
  run('uv', ['sync', '--frozen'], { cwd: stockExchange });
  const py = join(stockExchange, '.venv/bin/python');
  run(py, ['-m', 'scripts.parity_seed_users'], { cwd: stockExchange, env });
  const python = start('python', py, ['-m', 'uvicorn', 'alpha_terminal.api.main:app', '--port', '5194'], {
    cwd: stockExchange,
    env: { ...process.env, ...env }
  });
  await waitFor(async () => (await fetch('http://localhost:5194/api/v1/health')).ok, 'StockExchange parity host', 90000).catch((error) => {
    throw new Error(`${error.message}\n${python.output().slice(-2000)}`);
  });
  const dotnet = await startDotnetHost(join(outBase, 'python-parity'), 'gen_e2e_pyparity', 5195);
  const r = run('node', [join(root, 'scripts/verify/contract-parity.mjs'), '--suite', 'subscription-plans'], {
    env: { PYTHON_BASE: 'http://localhost:5194', DOTNET_BASE: 'http://localhost:5195', PYTHON_JWT_SECRET: pythonJwtSecret, ...jwt },
    allowFail: true
  });
  writeParityLog('subscription-plans', r.stdout);
  const summary = r.stdout.trim().split('\n').pop();
  const fails = r.stdout.split('\n').filter((l) => /^FAIL|^      /.test(l));
  step('contract-parity (subscription-plans)', r.status === 0, `${summary}${fails.length ? `\n${fails.join('\n')}` : ''}`);
  dotnet.child.kill('SIGKILL');
  python.child.kill('SIGKILL');
}

/** Python generator bundle (same entry as `regen-python.mjs`). */
async function loadPythonGenerator() {
  const outfile = join(root, 'scripts/verify/out/.harness/python-e2e-bundle.mjs');
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

async function pythonGoldenParity() {
  const gen = await loadPythonGenerator();
  const hostDir = join(outBase, 'python-golden');
  rmSync(hostDir, { recursive: true, force: true });
  mkdirSync(hostDir, { recursive: true });
  const boot = gen.bootstrapPythonProject(hostDir, 'SampleHost');
  if (!boot.success) throw new Error(`python golden host bootstrap: ${boot.error}`);
  const models = JSON.parse(readFileSync(join(root, 'scripts/verify/fixtures/dotnet/models.json'), 'utf8'));
  gen.generatePythonModules(hostDir, gen.toPythonPackageName('SampleHost'), models);
  const env = { ...process.env };
  delete env.VIRTUAL_ENV;
  run('uv', ['sync', '--quiet'], { cwd: hostDir, env });
  const python = start('python-golden', join(hostDir, '.venv/bin/python'), ['-m', 'uvicorn', 'sample_host.api.main:app', '--port', '5196'], {
    cwd: hostDir,
    env: { ...env, MONGO_URI: 'mongodb://localhost:27028', MONGO_DB_NAME: 'py_golden', ...jwt }
  });
  await waitFor(async () => (await (await fetch('http://localhost:5196/api/v1/health')).json()).data?.mongoConnected === true, 'Python golden host', 90000).catch((error) => {
    throw new Error(`${error.message}\n${python.output().slice(-2000)}`);
  });
  const dotnet = await startDotnetHost(join(outBase, 'models'), 'gen_e2e_pygolden', 5197);
  const r = run('node', [join(root, 'scripts/verify/contract-parity.mjs'), '--suite', 'golden-models'], {
    env: { PYTHON_BASE: 'http://localhost:5196', DOTNET_BASE: 'http://localhost:5197', ...jwt },
    allowFail: true
  });
  writeParityLog('golden-models', r.stdout);
  const summary = r.stdout.trim().split('\n').pop();
  const fails = r.stdout.split('\n').filter((l) => /^FAIL|^      /.test(l));
  step('contract-parity (golden-models)', r.status === 0, `${summary}${fails.length ? `\n${fails.join('\n')}` : ''}`);
  dotnet.child.kill('SIGKILL');
  python.child.kill('SIGKILL');
}

async function expressParity() {
  if (!existsSync(join(varlik, 'node_modules'))) {
    step('parity: Varlik360', false, `${varlik}/node_modules yok`);
    return;
  }
  // Varlik360's HTTP app only, from an empty folder (no real .env), env limited to what it needs.
  // Copied out of the Generator tree: its package.json is "type": "module", which would load the .ts as ESM
  // instead of through ts-node (CommonJS, Varlik360's path aliases).
  const cwd = mkdtempSync(join(tmpdir(), 'gen-e2e-express-'));
  copyFileSync(join(root, 'scripts/verify/fixtures/express-parity-host.ts'), join(cwd, 'host.ts'));
  const express = start('express', 'node', [
    '-r', join(varlik, 'node_modules/ts-node/register'),
    '-r', join(varlik, 'node_modules/tsconfig-paths/register'),
    join(cwd, 'host.ts')
  ], {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PORT: '5192',
      MONGODB_URI: 'mongodb://localhost:27028/parity',
      JWT_SECRET: jwt.JWT_SECRET,
      ADMIN_USER_IDS: '65f000000000000000000001',
      ISPRODUCTION: 'false',
      MAIL_SERVICE_ENABLED: 'false',
      TS_NODE_PROJECT: join(varlik, 'tsconfig.json'),
      TS_NODE_TRANSPILE_ONLY: 'true'
    }
  });
  await waitFor(async () => express.output().includes('express parity host ready'), 'Express parity host', 90000).catch((error) => {
    throw new Error(`${error.message}\n${express.output().slice(-2000)}`);
  });
  // Mongoose builds indexes after connect; give it a moment before the unique scenarios.
  await new Promise((r) => setTimeout(r, 3000));
  const golden = await startDotnetHost(join(outBase, 'golden'), 'gen_e2e_golden', 5193);
  const r = run('node', [join(root, 'scripts/verify/contract-parity.mjs')], {
    env: { EXPRESS_BASE: 'http://localhost:5192', DOTNET_BASE: 'http://localhost:5193', ...jwt },
    allowFail: true
  });
  writeParityLog('symbols', r.stdout);
  const summary = r.stdout.trim().split('\n').pop();
  const fails = r.stdout.split('\n').filter((l) => /^FAIL|^      /.test(l));
  step('contract-parity', r.status === 0, `${summary}${fails.length ? `\n${fails.join('\n')}` : ''}`);
  golden.child.kill('SIGKILL');
  express.child.kill('SIGKILL');
  rmSync(cwd, { recursive: true, force: true });
}

try {
  await main();
} catch (error) {
  step('e2e', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
  dbServer.stop(['gen_e2e_models', 'gen_e2e_golden', 'gen_e2e_pyparity', 'gen_e2e_pygolden']);
}
log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);

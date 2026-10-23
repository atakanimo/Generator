#!/usr/bin/env node
/**
 * .NET EF Core end-to-end gate (plan backend-dotnet-efcore §8): runs generated hosts against real databases.
 *
 *  1. `regen-dotnet.mjs <label>` (build, idempotency, parser round trip, app flow, admin config).
 *  2. Smoke: `out/dotnet/<label>/models` → fresh Postgres DB → `dotnet ef migrations add` + `database update` →
 *     `dotnet run` → dotnet-d2 / d3 / d4 / py1-formats smokes (need empty tables, run first) → dotnet-d0-smoke (event-types).
 *  3. Parity (skip with --no-parity): Mongo in Docker (`mongo:7`) + Varlik360's HTTP app
 *     (`fixtures/express-parity-host.ts`) vs the golden host on Postgres → `contract-parity.mjs`.
 *
 * Needs: dotnet 10 SDK, a local Postgres reachable as `PG_HOST` (default /tmp socket) by the current user with
 * `createdb` rights, and for parity Docker (OrbStack) + Varlik360 checked out with node_modules.
 *
 * Run:  node scripts/verify/dotnet-e2e.mjs [label] [--no-parity] [--skip-regen] [--parity-only]
 */
import { spawn, spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir, userInfo } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'reference';
const parity = !args.includes('--no-parity');
const outBase = join(root, 'scripts/verify/out/dotnet', label);
const varlik = process.env.VARLIK360 ?? '/Users/atakanatabey/Projects/VarlikALL/Varlik360';
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

/** Fresh database + migration + `dotnet run` of a generated host. */
async function startDotnetHost(hostDir, db, port) {
  run('psql', ['-h', pgHost, '-d', 'postgres', '-qc', `drop database if exists ${db}`, '-c', `create database ${db}`]);
  rmSync(join(hostDir, 'src/SampleHost.Infrastructure/Persistence/Migrations'), { recursive: true, force: true });
  const env = {
    ConnectionStrings__Default: `Host=${pgHost};Database=${db};Username=${pgUser}`,
    Jwt__Secret: jwt.JWT_SECRET,
    Jwt__Issuer: jwt.JWT_ISSUER,
    Jwt__Audience: jwt.JWT_AUDIENCE,
    ASPNETCORE_URLS: `http://localhost:${port}`
  };
  const ef = ['-p', 'src/SampleHost.Infrastructure', '-s', 'src/SampleHost.Api'];
  run('dotnet', ['tool', 'restore'], { cwd: hostDir });
  run('dotnet', ['ef', 'migrations', 'add', 'Initial', ...ef, '-o', 'Persistence/Migrations'], { cwd: hostDir, env });
  run('dotnet', ['ef', 'database', 'update', ...ef], { cwd: hostDir, env });
  run('dotnet', ['build', '-nologo', '-v', 'q'], { cwd: hostDir });
  // The built dll, not `dotnet run`: `dotnet run` starts the app as its own child, which a kill would leave running.
  const host = start(`dotnet:${port}`, 'dotnet', ['src/SampleHost.Api/bin/Debug/net10.0/SampleHost.Api.dll'], {
    cwd: hostDir,
    env: { ...process.env, ...env, ASPNETCORE_ENVIRONMENT: 'Development' }
  });
  await waitFor(async () => (await fetch(`http://localhost:${port}/api/health`)).ok, `.NET host on ${port}`);
  return host;
}

function smoke(script, base) {
  const r = run('node', [join(root, 'scripts/verify', script)], { env: { API_BASE: base, ...jwt }, allowFail: true });
  const out = `${r.stdout}${r.stderr}`;
  const passes = (out.match(/^PASS/gm) ?? []).length;
  const fails = out.split('\n').filter((l) => /^FAIL/.test(l));
  step(`${script}`, r.status === 0, `${passes} PASS${fails.length ? `\n      ${fails.join('\n      ')}` : ''}`);
}

async function main() {
  const parityOnly = args.includes('--parity-only');
  // 1. Generate + static gates.
  if (!args.includes('--skip-regen') && !parityOnly) {
    const r = run('node', [join(root, 'scripts/verify/regen-dotnet.mjs'), label], { allowFail: true });
    const passes = (r.stdout.match(/^PASS/gm) ?? []).length;
    step('regen-dotnet', r.status === 0, `${passes} PASS${r.status === 0 ? '' : `\n${r.stdout.split('\n').filter((l) => !/^PASS/.test(l)).join('\n')}`}`);
    if (r.status !== 0) return;
  }

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
  if (!existsSync(join(varlik, 'node_modules'))) {
    step('parity: Varlik360', false, `${varlik}/node_modules yok`);
    return;
  }
  run('docker', ['rm', '-f', 'gen-e2e-mongo'], { allowFail: true });
  run('docker', ['run', '-d', '--name', 'gen-e2e-mongo', '-p', '27028:27017', 'mongo:7']);
  try {
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
    const summary = r.stdout.trim().split('\n').pop();
    const fails = r.stdout.split('\n').filter((l) => /^FAIL|^      /.test(l));
    step('contract-parity', r.status === 0, `${summary}${fails.length ? `\n${fails.join('\n')}` : ''}`);
    golden.child.kill('SIGKILL');
    express.child.kill('SIGKILL');
    rmSync(cwd, { recursive: true, force: true });
  } finally {
    run('docker', ['rm', '-f', 'gen-e2e-mongo'], { allowFail: true });
  }
}

try {
  await main();
} catch (error) {
  step('e2e', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
  for (const db of ['gen_e2e_models', 'gen_e2e_golden']) {
    spawnSync('psql', ['-h', pgHost, '-d', 'postgres', '-qc', `drop database if exists ${db} with (force)`]);
  }
}
log(failed ? `\n${failed} FAIL` : '\nall PASS');
process.exit(failed ? 1 : 0);

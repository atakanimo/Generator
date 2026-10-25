#!/usr/bin/env node
/**
 * Python + FastAPI entry gate (plan backend-python-fastapi PY8): runs the Python gates in order and prints one summary.
 *
 *  1. `regen-python.mjs`     module generator: empty host (fixture models + golden set, generated module tests, ruff,
 *                            lint-imports, pytest, HTTP smoke on Docker Mongo) + StockExchange copy.
 *  2. `python-bootstrap.mjs` skeleton + assets: empty host, uv sync, ruff, lint-imports, pytest, uvicorn health,
 *                            assets = StockExchange.
 *  3. `python-import.mjs`    Pydantic import, scan, round trip, StockExchange copy, extra-field report.
 *  4. Parity (`dotnet-e2e.mjs --python-only`): `contract-parity --suite subscription-plans` (StockExchange API vs the
 *     .NET `python-parity` host) and `--suite golden-models` (generated Python golden host vs the .NET `models` host).
 *     `regen-dotnet.mjs <label>` rebuilds those .NET hosts first (the generators may have changed); `--reuse-dotnet`
 *     skips it when `out/dotnet/<label>/{models,python-parity}` exist.
 *
 * Every gate's full output: `scripts/verify/out/python-e2e/<gate>.log`; parity scenario lists stay where dotnet-e2e
 * writes them (`out/dotnet/<label>/parity-<suite>.log`). The summary lists each gate's PASS count and its FAIL lines.
 *
 * Needs: uv + Python 3.12, Docker (OrbStack) for the smokes and parity, and for parity the .NET 10 SDK + local Postgres
 * (see dotnet-e2e.mjs) + StockExchange with uv.
 *
 * Run:  node scripts/verify/python-e2e.mjs [label] [--no-docker] [--no-stockexchange] [--no-parity] [--reuse-dotnet]
 *                                          [--only=<gate,…>]
 *       gates: regen-python, python-bootstrap, python-import, parity
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'reference';
const noDocker = args.includes('--no-docker');
const noStockExchange = args.includes('--no-stockexchange');
const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',');
const logDir = join(root, 'scripts/verify/out/python-e2e');
const dotnetOut = join(root, 'scripts/verify/out/dotnet', label);

/** Runs a node script, streams nothing, returns status + output (`spawn`: gates can take minutes). */
function runNode(script, scriptArgs) {
  return new Promise((resolve) => {
    const child = spawn('node', [join(root, 'scripts/verify', script), ...scriptArgs], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (status) => resolve({ status, output }));
  });
}

const results = [];

async function gate(name, script, scriptArgs) {
  const started = Date.now();
  process.stdout.write(`… ${name} `);
  const { status, output } = await runNode(script, scriptArgs);
  writeFileSync(join(logDir, `${name}.log`), output);
  const lines = output.split('\n');
  const passes = lines.filter((l) => /^PASS/.test(l)).length;
  const fails = lines.filter((l) => /^FAIL/.test(l));
  const ok = status === 0;
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${passes} PASS${fails.length ? ` / ${fails.length} FAIL` : ''}  (${seconds} sn)`);
  for (const f of fails) console.log(`      ${f}`);
  // Parity: one line per suite (its scenario summary).
  if (name === 'parity') for (const l of lines.filter((x) => /^PASS/.test(x))) console.log(`      ${l}`);
  if (!ok && !fails.length) console.log(lines.filter(Boolean).slice(-15).map((l) => `      ${l}`).join('\n'));
  results.push({ name, ok, passes, fails: fails.length });
  return ok;
}

const wanted = (name) => !only || only.includes(name);
const flags = [...(noDocker ? ['--no-docker'] : []), ...(noStockExchange ? ['--no-stockexchange'] : [])];

mkdirSync(logDir, { recursive: true });
if (wanted('regen-python')) await gate('regen-python', 'regen-python.mjs', flags);
if (wanted('python-bootstrap')) await gate('python-bootstrap', 'python-bootstrap.mjs', noStockExchange ? ['--no-stockexchange'] : []);
if (wanted('python-import')) await gate('python-import', 'python-import.mjs', flags);
if (wanted('parity')) {
  if (args.includes('--no-parity') || noDocker) {
    console.log('SKIP  parity (--no-parity / --no-docker)');
  } else {
    const reuse = args.includes('--reuse-dotnet') && existsSync(join(dotnetOut, 'models')) && existsSync(join(dotnetOut, 'python-parity'));
    const ready = reuse || (await gate('regen-dotnet', 'regen-dotnet.mjs', [label]));
    // `--python-only` without StockExchange still runs golden-models; the subscription-plans suite reports it missing.
    if (ready) await gate('parity', 'dotnet-e2e.mjs', [label, '--python-only']);
  }
}

const failedGates = results.filter((r) => !r.ok);
console.log(
  `\n${results.map((r) => `${r.name} ${r.ok ? 'PASS' : 'FAIL'} (${r.passes}${r.fails ? ` / ${r.fails} FAIL` : ''})`).join(', ')}` +
    `\n${failedGates.length ? `${failedGates.length} gate FAIL` : 'all PASS'}  (loglar: ${logDir})`
);
process.exit(failedGates.length ? 1 : 0);

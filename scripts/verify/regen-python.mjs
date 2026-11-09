/**
 * Python + FastAPI module generator gate (plan backend-python-fastapi PY5, PY6, PY8).
 *
 * (a) Empty host (`out/regen-python/host`, rebuilt each run):
 *     `bootstrapPythonProject` → the fixture models (`fixtures/python/*.models.json` + the golden set
 *     `fixtures/dotnet/models.json`: reference / populate, decimal, map / json, access) through the model editor path
 *     (`writePythonModel`: manifest row + generate) → a second generate writes nothing → `uv sync`, import, `ruff check`,
 *     `ruff format --check` (generated modules + module tests), `lint-imports`, `pytest`: every module's generated test
 *     (PY8, K `tests/modules/<m>/test_admin_crud.py`) on its own, then the whole suite (skeleton tests, module tests and
 *     `fixtures/python/tests/test_<m>_cases.py`: golden-set semantics the generic module test cannot express)
 *     → uvicorn on a throwaway Docker Mongo (`mongo:7`) + HTTP smoke (CRUD, 409, 400, 404, dates; PY6: populate,
 *     relation check, decimal range / sort and `Decimal128` storage, hidden fields over HTTP; pytest also runs on real Mongo).
 * (b) StockExchange copy (`out/regen-python/stockexchange`: `pyproject.toml` + `src/`; the real repo is never written):
 *     `SubscriptionPlans` generated → only its G files and the manifest change; every G file = StockExchange's file, or
 *     = `ruff format` of it (PY3 was hand-written; the generator writes ruff-format output); K files, assets and the
 *     registry untouched; a second generate writes nothing.
 *
 * Run:  node scripts/verify/regen-python.mjs [--no-docker] [--no-stockexchange]
 *       STOCKEXCHANGE_ROOT overrides ~/Projects/AtaAllWorkspace/AlphaTerminal.
 */
import { build } from 'esbuild';
import { spawn, spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { createConnection, createServer } from 'net';
import { homedir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { AUTH_ALL_MODULES, AUTH_TEST_ADMIN } from './auth-scenarios.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const withDocker = !process.argv.includes('--no-docker');
const withStockExchange = !process.argv.includes('--no-stockexchange');
const stockExchange = process.env.STOCKEXCHANGE_ROOT ?? join(homedir(), 'Projects/AtaAllWorkspace/AlphaTerminal');
const outDir = join(root, 'scripts/verify/out/regen-python');
const fixtures = join(root, 'scripts/verify/fixtures/python');
const appName = 'SampleHost';
const jwtSecret = 'regen-secret-0123456789abcdef0123456789abcdef';
const mongoContainer = 'gen-regen-python-mongo';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
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
    if (name === '.DS_Store' || name === '__pycache__' || name === '.venv' || name === '.ruff_cache' || name === '.pytest_cache') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

const hostEnv = (extra = {}) => {
  const env = { ...process.env, ...extra };
  delete env.VIRTUAL_ENV;
  return env;
};

function run(cwd, cmd, args, extra = {}, input) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: hostEnv(extra), timeout: 600_000, input });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
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

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loadModels = (file) => JSON.parse(readFileSync(join(fixtures, file), 'utf8'));
const written = (files) => files.filter((f) => f.action === 'created' || f.action === 'updated');

const gen = await loadBundle();
const spModels = loadModels('subscription-plans.models.json');
const goldenModels = JSON.parse(readFileSync(join(root, 'scripts/verify/fixtures/dotnet/models.json'), 'utf8'));
// Order matters: `models[1]` (Contacts) is the K file edit check below.
const models = [...spModels, ...loadModels('py5-kinds.models.json'), ...goldenModels, ...loadModels('py6-kinds.models.json')];

// ---------------------------------------------------------------------------------------------------------------
// (a) Empty host
// ---------------------------------------------------------------------------------------------------------------
const host = join(outDir, 'host');
rmSync(host, { recursive: true, force: true });
mkdirSync(host, { recursive: true });
const pkg = gen.toPythonPackageName(appName);

const boot = await gen.bootstrapPythonProject(host, appName, { modules: AUTH_ALL_MODULES, admin: AUTH_TEST_ADMIN });
check('host: bootstrap', boot.success, boot.error ?? `${boot.files?.length} file(s)`);
for (const model of models) {
  const res = gen.writePythonModel(host, { model });
  check(`host: writePythonModel ${model.entityName}`, res.success && res.sourceRelativePath?.endsWith('/model_generated.py'), res.error ?? res.sourceRelativePath);
}
const manifest = gen.readWorkspaceManifest(host);
check(
  'host: manifest rows + backendStack',
  // The golden `Users` lands on the bootstrap's auth `Users` (docs/backend/auth.md): same row, auth fields locked.
  manifest?.workspace?.backendStack === 'python-fastapi' && manifest.models.length === models.length &&
    ['passwordHash', 'status', 'emailVerified'].every((f) => manifest.models.find((m) => m.model.entityName === 'Users')?.model.fields.some((x) => x.name === f)),
  `${manifest?.models.length} row(s)`
);
const draft = gen.loadPythonModelDraft(join(host, 'src', pkg, 'modules/subscription_plans/model_generated.py'));
check('host: loadPythonModelDraft', draft.success && draft.draft?.model.entityName === 'SubscriptionPlans', draft.error ?? '');

const modules = models.map((m) => gen.pythonModuleNames(m.entityName).folder);
const gFiles = ['model_generated.py', 'schemas_generated.py', 'repository_generated.py', 'service_generated.py', 'admin_router_generated.py'];
const kFiles = ['__init__.py', 'model.py', 'repository.py', 'hooks.py', 'service.py'];
for (const folder of modules) {
  const dir = join(host, 'src', pkg, 'modules', folder);
  const missing = [...gFiles, ...kFiles].filter((f) => !existsSync(join(dir, f)));
  // The auth `Users` has no generic module test (its rows are the auth layer's; docs/backend/auth.md).
  if (folder !== 'users' && !existsSync(join(host, 'tests/modules', folder, 'test_admin_crud.py'))) missing.push(`tests/modules/${folder}/test_admin_crud.py`);
  const headerless = gFiles.filter((f) => existsSync(join(dir, f)) && !readFileSync(join(dir, f), 'utf8').startsWith('# <auto-generated by Generator />\n'));
  check(`host: ${folder} files (${gFiles.length} G + ${kFiles.length} K + module test)`, !missing.length && !headerless.length, [...missing, ...headerless].join(', '));
}
const registry = readFileSync(join(host, 'src', pkg, 'api/routers_generated.py'), 'utf8');
check(`host: registry lists all ${modules.length} modules`, modules.every((m) => registry.includes(`${m}_admin_router,`)));
const indexesRegistry = readFileSync(join(host, `src/${pkg}/api/indexes_generated.py`), 'utf8');
const repositories = models.map((m) => `${gen.pythonModuleNames(m.entityName).entity}Repository,`);
check('host: indexes registry lists every repository', repositories.every((r) => indexesRegistry.includes(r)));

// Second generate: nothing written (every module through the app's generate).
const again = models.flatMap((model) => gen.generatePythonBackend(host, model).writtenFiles ?? ['<failed>']);
check('host: second generate writes nothing', again.length === 0, again.join(', '));

// K file edits survive a generate; a header-less G file is left alone.
const hooksPath = join(host, 'src', pkg, 'modules/contacts/hooks.py');
const hooksBefore = readFileSync(hooksPath, 'utf8');
writeFileSync(hooksPath, `${hooksBefore}\n# user edit\n`);
const keep = gen.generatePythonBackend(host, models[1]);
check('host: K file edit kept', readFileSync(hooksPath, 'utf8').endsWith('# user edit\n') && (keep.writtenFiles ?? []).length === 0);
writeFileSync(hooksPath, hooksBefore);

// Golden-set cases beyond the generated module tests (skeleton's fixtures: real test Mongo, `make_token`).
for (const file of readdirSync(join(fixtures, 'tests'))) {
  const folder = /^test_(.+)_cases\.py$/.exec(file)?.[1];
  if (!folder) continue;
  mkdirSync(join(host, 'tests/modules', folder), { recursive: true });
  writeFileSync(join(host, 'tests/modules', folder, file), readFileSync(join(fixtures, 'tests', file), 'utf8').split('__app__').join(pkg));
}

const sync = run(host, 'uv', ['sync', '--quiet']);
check('host: uv sync', sync.ok, sync.ok ? '' : tail(sync.output));
const imports = modules.flatMap((m) => gFiles.concat(['service.py']).map((f) => `${pkg}.modules.${m}.${f.replace(/\.py$/, '')}`));
const imp = run(host, 'uv', ['run', '--no-sync', 'python', '-c', `import ${pkg}.api.main, ${pkg}.worker.main, ${imports.join(', ')}`], { JWT_SECRET: '' });
check('host: import api / worker / modules', imp.ok, imp.ok ? '' : tail(imp.output));
const ruff = run(host, 'uv', ['run', '--no-sync', 'ruff', 'check', 'src', 'tests']);
check('host: ruff check', ruff.ok, ruff.ok ? '' : tail(ruff.output, 40));
const moduleTests = modules.filter((m) => m !== 'users').map((m) => `tests/modules/${m}/test_admin_crud.py`);
const fmt = run(host, 'uv', ['run', '--no-sync', 'ruff', 'format', '--check', ...modules.map((m) => `src/${pkg}/modules/${m}`), `src/${pkg}/api/routers_generated.py`, ...moduleTests]);
check('host: ruff format --check (generated modules + module tests)', fmt.ok, fmt.ok ? '' : tail(fmt.output, 20));
const li = run(host, 'uv', ['run', '--no-sync', 'lint-imports']);
check('host: lint-imports', li.ok, li.ok ? /Contracts: .*/.exec(li.output)?.[0] ?? '' : tail(li.output));
// PY8: the generated module tests alone (no fixture help), none skipped.
const own = run(host, 'uv', ['run', '--no-sync', 'pytest', '-q', '-p', 'no:cacheprovider', ...moduleTests]);
check('host: generated module tests (pytest, own)', own.ok && !/skipped/.test(own.output), /\d+ passed[^\n]*/.exec(own.output)?.[0] ?? tail(own.output, 40));
const tests = run(host, 'uv', ['run', '--no-sync', 'pytest', '-q', '-p', 'no:cacheprovider']);
check('host: pytest', tests.ok, /\d+ passed[^\n]*/.exec(tests.output)?.[0] ?? tail(tests.output, 40));

// uvicorn + HTTP smoke on a throwaway Mongo.
if (withDocker) {
  const mongoPort = await freePort();
  run(host, 'docker', ['rm', '-f', mongoContainer]);
  const started = run(host, 'docker', ['run', '-d', '--name', mongoContainer, '-p', `${mongoPort}:27017`, 'mongo:7']);
  check('smoke: mongo container', started.ok, started.ok ? `:${mongoPort}` : tail(started.output));
  let server;
  let serverLog = '';
  try {
    for (let i = 0; i < 80 && !(await portOpen(mongoPort)); i++) await sleep(250);
    await sleep(1000);
    const port = await freePort();
    server = spawn('uv', ['run', '--no-sync', 'uvicorn', `${pkg}.api.main:app`, '--host', '127.0.0.1', '--port', String(port)], {
      cwd: host,
      env: hostEnv({ JWT_SECRET: jwtSecret, MONGO_URI: `mongodb://127.0.0.1:${mongoPort}`, MONGO_DB_NAME: 'regen_python' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', (d) => (serverLog += d));
    server.stderr.on('data', (d) => (serverLog += d));
    const base = `http://127.0.0.1:${port}/api/v1`;
    let health;
    for (let i = 0; i < 80 && !health; i++) {
      try {
        health = await (await fetch(`${base}/health`)).json();
      } catch {
        await sleep(250);
      }
    }
    check('smoke: health, Mongo connected', health?.data?.mongoConnected === true, health ? JSON.stringify(health.data) : tail(serverLog));
    // Startup ran `ensure_crud_indexes` (`api/indexes_generated.py`): the unique index exists before any write.
    const indexes = run(host, 'docker', ['exec', mongoContainer, 'mongosh', '--quiet', 'regen_python', '--eval',
      'JSON.stringify(db.subscription_plans.getIndexes().filter(i => i.unique).map(i => Object.keys(i.key).join(",")))']);
    check('smoke: unique index created on startup (code)', indexes.ok && indexes.output.includes('"code"'), tail(indexes.output));
    // The role comes from the user record (docs/backend/auth.md): log in as the seeded first admin.
    const login = await (
      await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: AUTH_TEST_ADMIN.email, password: AUTH_TEST_ADMIN.password }) })
    ).json();
    check('smoke: first admin logs in', !!login.data?.accessToken, JSON.stringify(login).slice(0, 200));
    const admin = { Authorization: `Bearer ${login.data?.accessToken}`, 'Content-Type': 'application/json' };
    const call = async (method, path, body, headers = admin) => {
      const resp = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: resp.status, body: await resp.json() };
    };
    const plan = {
      code: 'smoke',
      name: 'Smoke',
      price: { monthly: 1, yearly: 10, currency: 'USD' },
      limits: { watchlistMax: 5, liveDataEnabled: true, apiAccessEnabled: false },
      features: { llmSynthesis: false, customScreener: true, backtest: false, watchlist: true, liveQuote: false },
      rateLimit: { requestsPerMinute: 10 }
    };
    const sp = '/admin-crud/subscription-plans';
    check('smoke: 401 without token', (await call('POST', `${sp}/get-all`, {}, { 'Content-Type': 'application/json' })).status === 401);
    const created = await call('POST', `${sp}/create`, plan);
    const id = created.body.data?.id;
    check('smoke: create', created.status === 200 && created.body.data?.tier === 'free' && created.body.data?.limits?.watchlistMax === 5, JSON.stringify(created.body).slice(0, 200));
    check('smoke: duplicate code 409', (await call('POST', `${sp}/create`, plan)).status === 409);
    check('smoke: validation 400', (await call('POST', `${sp}/create`, { ...plan, code: '' })).status === 400);
    const list = await call('POST', `${sp}/get-all`, { filters: { code: 'SMO' } });
    check('smoke: list + filter', list.status === 200 && list.body.data?.total === 1, JSON.stringify(list.body.data).slice(0, 200));
    const updated = await call('POST', `${sp}/update/${id}`, { tier: 'pro' });
    check('smoke: update', updated.status === 200 && updated.body.data?.tier === 'pro');
    const ct = '/admin-crud/contacts';
    const contact = await call('POST', `${ct}/create`, { email: 'smoke@x.io', fullName: 'Smoke', birthday: '1990-05-17', level: 30, roles: ['owner'] });
    check('smoke: contacts create (date, numeric enum)', contact.status === 200 && contact.body.data?.birthday === '1990-05-17' && contact.body.data?.level === 30, JSON.stringify(contact.body).slice(0, 200));
    const byDay = await call('POST', `${ct}/get-all`, { filters: { birthday: '1990-05-17' } });
    check('smoke: contacts date filter', byDay.body.data?.total === 1);
    check('smoke: delete', (await call('DELETE', `${sp}/${id}`)).status === 200);
    check('smoke: get after delete 404', (await call('GET', `${sp}/${id}`)).status === 404);

    // PY6 over HTTP on real Mongo: decimal range / sort, populate, relation check, hidden.
    const mp = '/admin-crud/membership-plans';
    for (const [code, price] of [['d1', '9.99'], ['d2', '100'], ['d3', '250.5']]) {
      await call('POST', `${mp}/create`, { code, price, limits: { watermark: true }, tiers: [{ name: 't', price }] });
    }
    const codes = async (body) => ((await call('POST', `${mp}/get-all`, body)).body.data?.items ?? []).map((i) => i.code).join(',');
    check('smoke: decimal range filter (string bounds)', (await codes({ filters: { price: { min: '50', max: '200' } } })) === 'd2');
    check('smoke: decimal sort', (await codes({ sortBy: 'price', sortOrder: 'asc' })) === 'd1,d2,d3');
    const stored = run(host, 'docker', ['exec', mongoContainer, 'mongosh', '--quiet', 'regen_python', '--eval',
      'const d = db.membership_plans.findOne({code: "d1"}); print(d.price instanceof Decimal128, d.tiers[0].price instanceof Decimal128, d.price.toString())']);
    check('smoke: decimal stored as Decimal128 (top level + object[])', stored.ok && stored.output.trim() === 'true true 9.99', tail(stored.output));
    const et = (await call('POST', '/admin-crud/event-types/create', { name: 'Smoke ET' })).body.data;
    const doc = (await call('POST', '/admin-crud/documents/create', { type: 'kvkk', title: 'Smoke Doc', content: 'c' })).body.data;
    const tpl = await call('POST', '/admin-crud/templates/create', { name: 'Smoke T', eventTypeId: et?.id, documentIds: [doc?.id, doc?.id] });
    check('smoke: templates create (ids, m-n deduplicated)', tpl.status === 200 && tpl.body.data?.eventTypeId === et?.id && tpl.body.data?.documentIds?.length === 1, JSON.stringify(tpl.body).slice(0, 200));
    const tplRows = (await call('POST', '/admin-crud/templates/get-all', { filters: { eventTypeId: et?.id } })).body.data?.items ?? [];
    check('smoke: templates list populated', tplRows.length === 1 && tplRows[0].eventTypeId?.name === 'Smoke ET' && tplRows[0].documentIds?.[0]?.title === 'Smoke Doc', JSON.stringify(tplRows).slice(0, 200));
    check('smoke: missing reference 400', (await call('POST', '/admin-crud/templates/create', { name: 'x', eventTypeId: 'ffffffffffffffffffffffff' })).status === 400);
    const user = await call('POST', '/admin-crud/users/create', { email: 'smoke@x.io', password: 'secret', name: 'Smoke' });
    const userOne = await call('GET', `/admin-crud/users/${user.body.data?.id}`);
    check('smoke: hidden field never returned', user.status === 200 && !('password' in (user.body.data ?? {})) && userOne.status === 200 && !('password' in (userOne.body.data ?? {})));
  } finally {
    server?.kill('SIGTERM');
    run(host, 'docker', ['rm', '-f', mongoContainer]);
  }
} else {
  console.log('SKIP  HTTP smoke (--no-docker)');
}

// ---------------------------------------------------------------------------------------------------------------
// (b) StockExchange copy
// ---------------------------------------------------------------------------------------------------------------
if (withStockExchange) {
  const sePkg = 'alpha_terminal';
  if (!existsSync(join(stockExchange, 'src', sePkg))) {
    check('StockExchange present', false, `${stockExchange} (use --no-stockexchange to skip)`);
  } else {
    const copy = join(outDir, 'stockexchange');
    rmSync(copy, { recursive: true, force: true });
    mkdirSync(copy, { recursive: true });
    cpSync(join(stockExchange, 'pyproject.toml'), join(copy, 'pyproject.toml'));
    cpSync(join(stockExchange, 'src'), join(copy, 'src'), { recursive: true, filter: (p) => !/__pycache__|\.pyc$/.test(p) });
    const seManifest = join(stockExchange, '.generator/manifest.json');
    if (existsSync(seManifest)) cpSync(seManifest, join(copy, '.generator/manifest.json'));
    const before = new Map(listFiles(copy).map((f) => [relative(copy, f), readFileSync(f)]));

    check('copy: findPythonHost', gen.findPythonHost(copy)?.pkg === sePkg);
    const res = gen.writePythonModel(copy, { model: spModels[0] });
    check('copy: writePythonModel SubscriptionPlans', res.success, res.error ?? '');

    const after = listFiles(copy).map((f) => relative(copy, f));
    const changed = after.filter((rel) => !before.has(rel) || !before.get(rel).equals(readFileSync(join(copy, rel))));
    const moduleRel = `src/${sePkg}/modules/subscription_plans`;
    // `api/indexes_generated.py` is a new G registry; StockExchange does not call it yet (its `app_state` sets indexes).
    const allowed = new Set([...gFiles.map((f) => `${moduleRel}/${f}`), '.generator/manifest.json', `src/${sePkg}/api/indexes_generated.py`]);
    const unexpected = changed.filter((rel) => !allowed.has(rel));
    check('copy: only G files + manifest change (K files, assets, registry untouched)', unexpected.length === 0, unexpected.join(', '));

    const formatted = (text) => run(stockExchange, 'uv', ['run', '--no-sync', 'ruff', 'format', '--stdin-filename', 'x.py', '-'], {}, text);
    for (const file of gFiles) {
      const generated = readFileSync(join(copy, moduleRel, file), 'utf8');
      const real = readFileSync(join(stockExchange, moduleRel, file), 'utf8');
      if (generated === real) {
        check(`copy: ${file} = StockExchange`, true);
        continue;
      }
      const f = formatted(real);
      const same = f.ok && f.stdout === generated;
      check(`copy: ${file} = ruff format(StockExchange)`, same, same ? '' : f.ok ? 'differs beyond formatting' : tail(f.output));
    }
    const registryCopy = readFileSync(join(copy, `src/${sePkg}/api/routers_generated.py`), 'utf8');
    check('copy: registry = StockExchange', registryCopy === readFileSync(join(stockExchange, `src/${sePkg}/api/routers_generated.py`), 'utf8'));
    const second = gen.generatePythonBackend(copy, spModels[0]);
    check('copy: second generate writes nothing', second.success && (second.writtenFiles ?? []).length === 0, (second.writtenFiles ?? [second.error]).join(', '));
  }
} else {
  console.log('SKIP  StockExchange copy (--no-stockexchange)');
}

console.log(failed ? `\n${failed} check(s) FAILED (host kept: ${host})` : '\nall checks PASS');
process.exit(failed ? 1 : 0);

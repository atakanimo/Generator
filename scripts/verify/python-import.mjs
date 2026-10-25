/**
 * Python model import gate (plan backend-python-fastapi PY7): Pydantic parser (K1), project scan, the app's import
 * path (`previewPythonImport` / `importPythonModel`: what IPC `project:previewPythonImport` / `project:importPythonModel`
 * call) and the extra-field report.
 *
 * (a) Fixture host (`out/python-import/host`): `bootstrapPythonProject` + `fixtures/python/import/src/sample_app/modules`
 *     (`catalog_items/model.py`: every construct the parser reads; `CatalogItemsBad`: refused types) → scan lists it as
 *     importable → parse result checked field by field → refused class leaves no manifest row → import → scan lists the
 *     generated module → schema designer load → second generate writes nothing → re-import refused → `uv sync`,
 *     `api.main` import, `ruff check` / `ruff format --check` of the generated module, the generated document model
 *     accepts a document and rejects an extra key (`extra="forbid"`).
 * (b) Round trip: the fixture models of `regen-python` are generated, every `model_generated.py` is parsed back and the
 *     file-owned parts (kind, array, enum, int / date format, constraints, default, object sub-fields) must match the
 *     manifest (known, documented losses aside).
 * (c) StockExchange copy (`out/python-import/stockexchange`; the real repo is never written): scan (generated
 *     `SubscriptionPlans` + importable modules), all 14 hand-written entity models parse with nothing refused,
 *     the subject (`SUBJECT`, a module outside the PY-R screens) imported → only its G files, the new `hooks.py`, the registries and the manifest change; notes name
 *     the K files to adapt; G files pass `ruff` and import with StockExchange's venv; a second generate writes nothing.
 * (d) Real StockExchange data, read-only: extra-field report of the subject (local Mongo from `config.env`; when it
 *     is not reachable the report must say so); the generated row model is run on the same documents and must fail
 *     exactly as the report predicts. `git status` of StockExchange is the same before and after.
 * (e) Report fixture on a throwaway Docker Mongo: extra (top-level / sub-object / object[]), missing, wrong type, soft
 *     (ISO string date) rows; unreachable server, missing configuration and a remote server are reported, not thrown.
 *
 * Run:  node scripts/verify/python-import.mjs [--no-docker] [--no-stockexchange]
 *       STOCKEXCHANGE_ROOT overrides ~/Projects/VarlikALL/StockExchange.
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { createServer } from 'net';
import { homedir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const withDocker = !process.argv.includes('--no-docker');
const withStockExchange = !process.argv.includes('--no-stockexchange');
const stockExchange = process.env.STOCKEXCHANGE_ROOT ?? join(homedir(), 'Projects/VarlikALL/StockExchange');
const outDir = join(root, 'scripts/verify/out/python-import');
const fixtures = join(root, 'scripts/verify/fixtures/python');
const mongoContainer = 'gen-python-import-mongo';
const seVenvPython = join(stockExchange, '.venv/bin/python');

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
}

async function loadBundle() {
  const outfile = join(root, 'scripts/verify/out/.harness/python-import-bundle.mjs');
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

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['.DS_Store', '__pycache__', '.venv', '.ruff_cache', '.pytest_cache'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function snapshot(dir) {
  return new Map(listFiles(dir).map((f) => [relative(dir, f), readFileSync(f)]));
}

function changedSince(dir, before) {
  return listFiles(dir)
    .map((f) => relative(dir, f))
    .filter((rel) => !before.has(rel) || !before.get(rel).equals(readFileSync(join(dir, rel))));
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
const fieldOf = (model, name) => model.fields.find((f) => f.name === name);
const json = (v) => JSON.stringify(v);
const gFiles = ['model_generated.py', 'schemas_generated.py', 'repository_generated.py', 'service_generated.py', 'admin_router_generated.py'];

const gen = await loadBundle();

// ---------------------------------------------------------------------------------------------------------------
// (a) Fixture host
// ---------------------------------------------------------------------------------------------------------------
const host = join(outDir, 'host');
rmSync(host, { recursive: true, force: true });
mkdirSync(host, { recursive: true });
const boot = gen.bootstrapPythonProject(host, 'SampleApp');
check('host: bootstrap', boot.success && boot.package === 'sample_app', boot.error ?? '');
cpSync(join(fixtures, 'import/src/sample_app/modules'), join(host, 'src/sample_app/modules'), { recursive: true });
const modelPy = join(host, 'src/sample_app/modules/catalog_items/model.py');

const scan1 = await gen.scanProject(host);
const importable = scan1.models.filter((m) => m.kind === 'importable').map((m) => m.fileName);
check('host: scan → python-fastapi, catalog_items importable', scan1.detectedType === 'python-fastapi' && json(importable) === json(['catalog_items/model.py']), json(scan1.models));

const parsed = gen.parsePydanticModel(modelPy, { root: host });
const m = parsed.model;
check('parse: document class by module name, candidates', parsed.className === 'CatalogItems' && parsed.candidates.length === 5, `${parsed.className} ${json(parsed.candidates)}`);
const expectations = [
  ['inherited Annotated alias from another module (absolute import)', 'sku', (f) => f.required && f.trim && json(f.constraints) === json({ minLength: 3, maxLength: 12, pattern: '^[A-Z0-9-]+$' })],
  ['Optional[relative-import alias]', 'altSku', (f) => !f.required && f.constraints?.maxLength === 12],
  ['Field(min_length, max_length)', 'title', (f) => f.required && json(f.constraints) === json({ minLength: 1, maxLength: 80 })],
  ['Literal alias + default', 'status', (f) => f.kind === 'enum' && json(f.enum.values) === json(['draft', 'active', 'archived']) && f.default === 'draft' && !f.required],
  ['StrEnum + member default', 'color', (f) => json(f.enum.values) === json(['red', 'dark-blue']) && f.default === 'red'],
  ['IntEnum → numeric enum, member default', 'priority', (f) => json(f.enum.numbers) === json([10, 20]) && f.default === 20],
  ['NonNegativeInt = 0', 'stock', (f) => f.numberFormat === 'int' && f.constraints?.min === 0 && f.default === 0],
  ['PositiveInt required', 'minOrder', (f) => f.required && f.constraints?.min === 1],
  ['Annotated[float, Field(gt, le)] | None', 'rating', (f) => !f.required && f.constraints?.min === 0 && f.constraints?.max === 5 && f.numberFormat === undefined],
  ['conint(ge, le) = 50', 'score', (f) => f.numberFormat === 'int' && f.constraints?.min === 1 && f.constraints?.max === 100 && f.default === 50],
  ['EmailStr | None', 'contactEmail', (f) => f.format === 'email' && !f.required],
  ['date → dateFormat date', 'releasedOn', (f) => f.kind === 'date' && f.dateFormat === 'date'],
  ['nested BaseModel', 'price', (f) => f.kind === 'object' && f.required && f.object.typeName === 'Price' && json(f.object.fields.map((s) => [s.name, s.kind, s.required])) === json([['amount', 'number', true], ['currency', 'string', true], ['note', 'string', false], ['vat', 'boolean', false]])],
  ['list[BaseModel] (sub-field list → json)', 'dimensions', (f) => f.kind === 'object' && f.isArray && f.object.fields.find((s) => s.name === 'tags')?.kind === 'json' && f.object.fields.find((s) => s.name === 'value')?.numberFormat === 'int'],
  ['dict[str, int] → map<number>', 'counters', (f) => f.kind === 'map' && f.native?.type === 'map<number>'],
  ['dict[str, Any] → opaque object', 'meta', (f) => f.kind === 'object' && !f.object?.fields?.length],
  ['Decimal("0.50") default', 'cost', (f) => f.kind === 'decimal' && f.default === '0.50'],
  ['list[Literal] → enum[]', 'labels', (f) => f.kind === 'enum' && f.isArray && json(f.enum.values) === json(['new', 'sale'])],
  ['X | None without default → required + nullable', 'archivedAt', (f) => f.required && f.nullable === true]
];
for (const [label, name, ok] of expectations) {
  const f = fieldOf(m, name);
  check(`parse: ${name}: ${label}`, !!f && ok(f), json(f));
}
check('parse: id skipped, timestamps last', !fieldOf(m, 'id') && json(m.fields.slice(-2).map((f) => f.name)) === json(['createdAt', 'updatedAt']));
check('parse: validator reported', parsed.warnings.some((w) => w.includes('_title')));
check('parse: exclusive bound reported', parsed.warnings.some((w) => w.includes('rating') && w.includes('gt=0')));
check('parse: ownerId reference suggestion', parsed.suggestions.some((s) => s.startsWith('ownerId')));
check('parse: nothing refused', parsed.unsupported.length === 0, json(parsed.unsupported));

const bad = gen.parsePydanticModel(modelPy, { root: host, className: 'CatalogItemsBad' });
check('parse: bytes / UUID refused', json(bad.unsupported) === json(['CatalogItemsBad.blob: bytes', 'CatalogItemsBad.token: UUID']), json(bad.unsupported));
const refused = gen.importPythonModel(host, modelPy, { className: 'CatalogItemsBad' });
check('import: refused class → error, no manifest row', !refused.success && /Desteklenmeyen/.test(refused.error ?? '') && (gen.readWorkspaceManifest(host)?.models ?? []).length === 0, refused.error);

const preview = gen.previewPythonImport(host, modelPy, { report: false });
check('preview (IPC path): CatalogItems, collection catalog_items', preview.success && preview.entityName === 'CatalogItems' && preview.collection === 'catalog_items' && !preview.report, preview.error ?? '');
const noClass = gen.previewPythonImport(host, join(host, 'src/sample_app/modules/shared/types.py'), { report: false });
check('preview: module without a Pydantic class → error', !noClass.success, noClass.error ?? '');

const imported = gen.importPythonModel(host, modelPy);
check('import (IPC path): success', imported.success && imported.sourceRelativePath === 'src/sample_app/modules/catalog_items/model_generated.py', imported.error ?? '');
const dir = join(host, 'src/sample_app/modules/catalog_items');
check('import: G files + K service / repository / hooks created', [...gFiles, 'service.py', 'repository.py', 'hooks.py'].every((f) => existsSync(join(dir, f))));
check('import: hand-written model.py kept', readFileSync(modelPy, 'utf8') === readFileSync(join(fixtures, 'import/src/sample_app/modules/catalog_items/model.py'), 'utf8'));
check('import: note says model.py still defines the class', (imported.notes ?? []).some((n) => n.includes('model.py')), json(imported.notes));
const scan2 = await gen.scanProject(host);
check('host: scan after import → generated, nothing importable', json(scan2.models.map((x) => [x.fileName, x.kind])) === json([['catalog_items/model_generated.py', 'generated']]), json(scan2.models));
const editor = gen.loadModelForEditor(join(dir, 'model_generated.py'), host, 'python-fastapi');
check('schema designer load (project:parseModel)', editor.success && editor.model?.entityName === 'CatalogItems' && !!editor.sourceHash, editor.error ?? '');
const again = gen.generatePythonBackend(host, gen.readWorkspaceManifest(host).models[0].model);
check('host: second generate writes nothing', again.success && (again.writtenFiles ?? []).length === 0, json(again.writtenFiles));
const twice = gen.importPythonModel(host, modelPy);
check('import: second import refused (already in manifest)', !twice.success && /zaten/.test(twice.error ?? ''), twice.error);

const sync = run(host, 'uv', ['sync', '--quiet']);
check('host: uv sync', sync.ok, sync.ok ? '' : tail(sync.output));
const imp = run(host, 'uv', ['run', '--no-sync', 'python', '-c', 'import sample_app.api.main, sample_app.modules.catalog_items.admin_router_generated'], { JWT_SECRET: '' });
check('host: api.main imports (registry → catalog_items router)', imp.ok, imp.ok ? '' : tail(imp.output));
const ruffTargets = [...gFiles.map((f) => `src/sample_app/modules/catalog_items/${f}`)];
const ruff = run(host, 'uv', ['run', '--no-sync', 'ruff', 'check', ...ruffTargets]);
check('host: ruff check (generated module)', ruff.ok, ruff.ok ? '' : tail(ruff.output, 30));
const fmt = run(host, 'uv', ['run', '--no-sync', 'ruff', 'format', '--check', ...ruffTargets]);
check('host: ruff format --check (generated module)', fmt.ok, fmt.ok ? '' : tail(fmt.output));
const forbid = run(host, 'uv', ['run', '--no-sync', 'python', '-c', `
from datetime import datetime, UTC
from pydantic import ValidationError
from sample_app.modules.catalog_items.model_generated import CatalogItems
doc = dict(id="x", sku="AB-12", title="t", minOrder=1, price={"amount": 1, "currency": "USD"}, archivedAt=None,
           createdAt=datetime.now(UTC), updatedAt=datetime.now(UTC))
CatalogItems.model_validate(doc)
for bad in ({**doc, "legacy": 1}, {**doc, "price": {"amount": 1, "currency": "USD", "discount": 2}}):
    try:
        CatalogItems.model_validate(bad)
        raise SystemExit("accepted " + str(bad))
    except ValidationError:
        pass
print("ok")
`]);
check('host: generated document model accepts a document, rejects extra keys (forbid)', forbid.ok && forbid.stdout.trim() === 'ok', tail(forbid.output));

// ---------------------------------------------------------------------------------------------------------------
// (b) Round trip: generated `model_generated.py` → parser → manifest
// ---------------------------------------------------------------------------------------------------------------
const rt = join(outDir, 'roundtrip');
rmSync(rt, { recursive: true, force: true });
mkdirSync(join(rt, 'src/rt'), { recursive: true });
const loadModels = (file) => JSON.parse(readFileSync(file, 'utf8'));
const rtModels = [
  ...loadModels(join(fixtures, 'subscription-plans.models.json')),
  ...loadModels(join(fixtures, 'py5-kinds.models.json')),
  ...loadModels(join(root, 'scripts/verify/fixtures/dotnet/models.json')),
  ...loadModels(join(fixtures, 'py6-kinds.models.json'))
];
gen.generatePythonModules(rt, 'rt', rtModels);
// Documented losses: numeric enum member names come back lower-case (`LOW` → `low`); a decimal default comes back as
// its string (`Decimal("0")` → "0", same output); per-element constraints of string arrays live only in the bodies;
// e-mail + own pattern: the e-mail check is the bodies' `_email` validator, the document model keeps only the pattern.
const ownedParts = (f) =>
  json({
    kind: f.kind,
    isArray: !!f.isArray,
    numberFormat: f.numberFormat,
    dateFormat: f.dateFormat,
    format: f.format === 'email' && f.constraints?.pattern ? undefined : f.format,
    enum: f.enum ? { values: f.enum.numbers ? f.enum.values.map((v) => v.toLowerCase()) : f.enum.values, numbers: f.enum.numbers } : undefined,
    constraints: f.isArray ? undefined : f.constraints,
    default: f.default === undefined ? undefined : String(f.default),
    sub: f.object?.fields?.map((s) => [s.name, s.kind, s.numberFormat ?? '', s.required && !s.nullable])
  });
for (const model of rtModels) {
  const folder = gen.pythonModuleNames(model.entityName).folder;
  const back = gen.parsePydanticModel(join(rt, 'src/rt/modules', folder, 'model_generated.py'), { className: model.entityName, entityName: model.entityName });
  const diffs = model.fields
    .filter((f) => f.name !== 'createdAt' && f.name !== 'updatedAt')
    .filter((f) => {
      const p = fieldOf(back.model, f.name);
      return !p || ownedParts(p) !== ownedParts(f);
    })
    .map((f) => f.name);
  check(`round trip: ${model.entityName}`, diffs.length === 0 && back.unsupported.length === 0, [...diffs, ...back.unsupported].join(', '));
}

// ---------------------------------------------------------------------------------------------------------------
// (c) StockExchange copy, (d) real StockExchange data (read-only)
// ---------------------------------------------------------------------------------------------------------------
// Import subject: a module outside the 12 admin screens (PY-R), so it stays hand-written while the screens are
// imported one by one; the generated / importable split is read from StockExchange's manifest.
const SUBJECT = { folder: 'ohlcv_discontinuity_alerts', entity: 'OhlcvDiscontinuityAlerts' };
const SUBJECT_FIELDS =
  'ticker:string! market:string! sourceJob:string detectedAt:date refClose:number! refBarTime:date livePrice:number! jumpPct:number! reason:enum comment:string status:enum resolvedAt:date createdAt:date updatedAt:date';
const seEntities = ['users', 'user_subscriptions', 'ip_blacklist', 'audit_logs', 'markets', 'providers', 'symbols', 'scheduled_reports', 'daily_report_watchlist', 'deep_dive_reports', 'deep_dive_prompts', 'market_pulse_items', 'ohlcv_discontinuity_alerts', 'user_watch_lists'];
if (withStockExchange && existsSync(join(stockExchange, 'src/alpha_terminal'))) {
  const gitBefore = run(stockExchange, 'git', ['status', '--porcelain']).stdout;
  const copy = join(outDir, 'stockexchange');
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(copy, { recursive: true });
  cpSync(join(stockExchange, 'pyproject.toml'), join(copy, 'pyproject.toml'));
  cpSync(join(stockExchange, 'src'), join(copy, 'src'), { recursive: true, filter: (p) => !/__pycache__|\.pyc$/.test(p) });
  if (existsSync(join(stockExchange, '.generator/manifest.json'))) cpSync(join(stockExchange, '.generator/manifest.json'), join(copy, '.generator/manifest.json'));
  const before = snapshot(copy);

  const scan = await gen.scanProject(copy);
  const seGenerated = scan.models.filter((x) => x.kind === 'generated').map((x) => x.entityName);
  const seImportable = scan.models.filter((x) => x.kind === 'importable').map((x) => x.fileName.split('/')[0]);
  const manifestModels = (gen.readWorkspaceManifest(copy)?.models ?? []).map((x) => x.model.entityName);
  const generatedFolders = new Set(scan.models.filter((x) => x.kind === 'generated').map((x) => x.fileName.split('/')[0]));
  const handWritten = seEntities.filter((e) => !generatedFolders.has(e));
  check(
    'copy: scan → python-fastapi, manifest models generated',
    scan.detectedType === 'python-fastapi' && seGenerated.includes('SubscriptionPlans') && json([...seGenerated].sort()) === json([...manifestModels].sort()),
    json(seGenerated)
  );
  check('copy: scan → every hand-written entity module importable', handWritten.every((e) => seImportable.includes(e)), `${seImportable.length}: ${seImportable.join(', ')}`);
  for (const entity of handWritten) {
    const r = gen.parsePydanticModel(join(copy, 'src/alpha_terminal/modules', entity, 'model.py'), { root: stockExchange });
    check(`copy: parse ${entity} → ${r.className}`, r.unsupported.length === 0 && r.model.fields.length > 2, `${r.model.fields.length} fields, ${r.warnings.length} warnings${r.unsupported.length ? `, refused: ${r.unsupported.join('; ')}` : ''}`);
  }

  const ipModel = join(copy, `src/alpha_terminal/modules/${SUBJECT.folder}/model.py`);
  const ipPreview = gen.previewPythonImport(copy, ipModel, { report: false });
  const ipFields = ipPreview.model?.fields.map((f) => `${f.name}:${f.kind}${f.required ? '!' : ''}`).join(' ');
  check(`copy: preview ${SUBJECT.entity}`, ipPreview.success && ipFields === SUBJECT_FIELDS, ipFields);
  const ipImport = gen.importPythonModel(copy, ipModel);
  check(`copy: import ${SUBJECT.entity} (IPC path)`, ipImport.success, ipImport.error ?? '');
  const moduleRel = `src/alpha_terminal/modules/${SUBJECT.folder}`;
  const allowed = new Set([
    ...gFiles.map((f) => `${moduleRel}/${f}`),
    `${moduleRel}/hooks.py`,
    'src/alpha_terminal/api/routers_generated.py',
    'src/alpha_terminal/api/indexes_generated.py',
    '.generator/manifest.json'
  ]);
  const changed = changedSince(copy, before);
  check('copy: only G files, new hooks.py, registries, manifest change', changed.every((c) => allowed.has(c)) && gFiles.every((f) => changed.includes(`${moduleRel}/${f}`)), changed.join(', '));
  check(
    'copy: notes name the K files to adapt (service / repository / model)',
    [`build_${SUBJECT.folder}_service`, `${SUBJECT.entity}RepositoryBase`, 'model.py'].every((k) => (ipImport.notes ?? []).some((n) => n.includes(k))),
    json(ipImport.notes)
  );
  const seRuffTargets = gFiles.map((f) => join(copy, moduleRel, f));
  const seRuff = run(stockExchange, 'uv', ['run', '--no-sync', 'ruff', 'check', '--select', 'E,F,I,UP,B', ...seRuffTargets]);
  check('copy: ruff check (E, F, I, UP, B) on generated files', seRuff.ok, seRuff.ok ? '' : tail(seRuff.output, 30));
  const seFmt = run(stockExchange, 'uv', ['run', '--no-sync', 'ruff', 'format', '--check', ...seRuffTargets]);
  check('copy: ruff format --check on generated files', seFmt.ok, seFmt.ok ? '' : tail(seFmt.output));
  const seImp = run(copy, seVenvPython, ['-c', `import alpha_terminal.modules.${SUBJECT.folder}.service_generated, alpha_terminal.modules.${SUBJECT.folder}.schemas_generated`], {
    PYTHONPATH: join(copy, 'src')
  });
  check('copy: generated modules import (StockExchange venv)', seImp.ok, seImp.ok ? '' : tail(seImp.output));
  const seAgain = gen.generatePythonBackend(copy, gen.readWorkspaceManifest(copy).models.find((x) => x.model.entityName === SUBJECT.entity).model);
  check('copy: second generate writes nothing', seAgain.success && (seAgain.writtenFiles ?? []).length === 0, json(seAgain.writtenFiles));

  // (d) Real data, read-only.
  const real = gen.previewPythonImport(stockExchange, join(stockExchange, `src/alpha_terminal/modules/${SUBJECT.folder}/model.py`));
  const report = real.report;
  if (report?.ok) {
    console.log(`INFO  report: ${real.reportSummary}`);
    check('real: report ran (read-only sample)', report.exists === true && report.scanned > 0, `${report.database}.${report.collection} ${report.scanned}/${report.total}`);
    const missingUpdated = report.missing.find((i) => i.path === 'updatedAt')?.docs ?? 0;
    // The generated row model on the same documents: as many fail as the report predicts (read-only `find`).
    const cfg = gen.resolveMongoConfig(stockExchange);
    const rows = run(copy, seVenvPython, ['-c', `
import os, sys
from pydantic import ValidationError
from pymongo import MongoClient
from alpha_terminal.core.crud import to_wire
from alpha_terminal.modules.${SUBJECT.folder}.schemas_generated import ${SUBJECT.entity}Row
client = MongoClient(os.environ["GEN_MONGO_URI"], serverSelectionTimeoutMS=3000)
bad = total = 0
for doc in client[sys.argv[1]]["${SUBJECT.folder}"].find({}).limit(${report.scanned}):
    total += 1
    try:
        ${SUBJECT.entity}Row.model_validate(to_wire(doc))
    except ValidationError:
        bad += 1
print(total, bad)
`, cfg.db], { PYTHONPATH: join(copy, 'src'), GEN_MONGO_URI: cfg.uri });
    const [total, badRows] = rows.stdout.trim().split(' ').map(Number);
    // Issues overlap across documents: the failing rows lie between the largest issue and the sum of all issues.
    const breaking = [...report.extra.filter((i) => i.breaksAdminRead), ...report.missing, ...report.mismatched].map((i) => i.docs);
    const low = Math.max(0, ...breaking);
    const high = Math.min(report.scanned, breaking.reduce((a, b) => a + b, 0));
    check(
      'real: generated row model fails as the report predicts',
      rows.ok && total === report.scanned && badRows >= low && badRows <= high,
      rows.ok ? `${badRows}/${total} rows fail, report predicts ${low}..${high} (updatedAt missing in ${missingUpdated})` : tail(rows.output)
    );
  } else {
    check('real: Mongo not reachable → reported, not thrown', real.success && !!report && ['unreachable', 'no-config', 'no-driver'].includes(report.reason), `${report?.reason}: ${report?.error}`);
  }
  const gitAfter = run(stockExchange, 'git', ['status', '--porcelain']).stdout;
  check('real: StockExchange working tree unchanged', gitBefore === gitAfter);
} else {
  console.log('SKIP  StockExchange (--no-stockexchange or missing)');
}

// ---------------------------------------------------------------------------------------------------------------
// (e) Report fixture on a throwaway Mongo
// ---------------------------------------------------------------------------------------------------------------
const reportRoot = existsSync(seVenvPython) ? stockExchange : host; // interpreter with PyMongo
const rModel = parsed.model;
const closed = await freePort();
const unreachable = gen.collectionReport(reportRoot, rModel, { collection: 'catalog_items', config: { uri: `mongodb://127.0.0.1:${closed}/x`, db: 'x' }, timeoutMs: 800 });
check('report: unreachable server → ok:false, reason unreachable', !unreachable.ok && unreachable.reason === 'unreachable', `${unreachable.reason}: ${unreachable.error}`);
const emptyRoot = join(outDir, 'no-config');
mkdirSync(emptyRoot, { recursive: true });
const noConfig = gen.collectionReport(emptyRoot, rModel, { collection: 'catalog_items' });
check('report: no configuration → reason no-config', !noConfig.ok && noConfig.reason === 'no-config', noConfig.error);
const remote = gen.collectionReport(reportRoot, rModel, { collection: 'catalog_items', config: { uri: 'mongodb+srv://user:secret@cluster0.example.net/prod', db: 'prod' } });
check('report: remote server skipped without permission, no credentials in output', !remote.ok && remote.reason === 'remote-skipped' && !json(remote).includes('secret'), remote.error);

if (withDocker) {
  const port = await freePort();
  run(root, 'docker', ['rm', '-f', mongoContainer]);
  const started = run(root, 'docker', ['run', '-d', '--name', mongoContainer, '-p', `127.0.0.1:${port}:27017`, 'mongo:7']);
  check('report: mongo container', started.ok, started.ok ? `:${port}` : tail(started.output));
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = run(root, 'docker', ['exec', mongoContainer, 'mongosh', '--quiet', '--eval', 'db.runCommand({ping:1}).ok']).stdout.trim() === '1';
      if (!ready) await sleep(500);
    }
    const seed = `
const now = new Date();
const base = { sku: 'AB-1', title: 't', minOrder: 1, price: { amount: 1, currency: 'USD' }, dimensions: [], createdAt: now, updatedAt: now };
db.catalog_items.insertMany([
  { ...base },
  { ...base, legacyFlag: true },
  { ...base, price: { amount: 1, currency: 'USD', discount: 5 }, dimensions: [{ name: 'w', value: 2, unit: 'cm' }] },
  { sku: 'AB-2', title: 't', price: { amount: 1, currency: 'USD' }, createdAt: now },
  { ...base, stock: '7', status: 'deleted', createdAt: '2024-01-01T00:00:00Z' }
]);
print(db.catalog_items.countDocuments());`;
    const seeded = run(root, 'docker', ['exec', mongoContainer, 'mongosh', '--quiet', 'rpt', '--eval', seed]);
    check('report: fixture seeded (5 documents)', seeded.ok && seeded.stdout.trim().endsWith('5'), tail(seeded.output));
    const r = gen.collectionReport(reportRoot, rModel, { collection: 'catalog_items', config: { uri: `mongodb://127.0.0.1:${port}/rpt`, db: 'rpt' } });
    const rows = (list) => json(list.map((i) => [i.path, i.docs, i.types.join('/'), i.breaksAdminRead]));
    check('report: ran over every document', r.ok && r.exists && r.total === 5 && r.scanned === 5 && !r.sampled, `${r.reason ?? ''} ${r.error ?? ''}`);
    check(
      'report: extra keys (top-level ignored by the row, sub-object / object[] break it)',
      rows(r.extra) === json([['dimensions[].unit', 1, 'string', true], ['legacyFlag', 1, 'bool', false], ['price.discount', 1, 'int', true]]),
      rows(r.extra)
    );
    check('report: missing required keys', rows(r.missing) === json([['minOrder', 1, '', true], ['updatedAt', 1, '', true]]), rows(r.missing));
    check('report: wrong types (string in int, value outside the enum)', rows(r.mismatched) === json([['status', 1, 'string', true], ['stock', 1, 'string', true]]), rows(r.mismatched));
    check('report: soft (ISO string date)', rows(r.soft) === json([['createdAt', 1, 'string', false]]), rows(r.soft));
    check('report: summary', /modelde olmayan 3 alan/.test(gen.summarizeReport(r)), gen.summarizeReport(r));
    const missingColl = gen.collectionReport(reportRoot, rModel, { collection: 'nothing_here', config: { uri: `mongodb://127.0.0.1:${port}/rpt`, db: 'rpt' } });
    check('report: missing collection → exists false', missingColl.ok && missingColl.exists === false);
    const count = run(root, 'docker', ['exec', mongoContainer, 'mongosh', '--quiet', 'rpt', '--eval', 'print(db.catalog_items.countDocuments(), db.getCollectionNames().length)']);
    check('report: read-only (documents and collections unchanged)', count.stdout.trim() === '5 1', count.stdout.trim());
  } finally {
    run(root, 'docker', ['rm', '-f', mongoContainer]);
  }
} else {
  console.log('SKIP  report fixture (--no-docker)');
}

console.log(failed ? `\n${failed} check(s) FAILED (kept: ${outDir})` : '\nall checks PASS');
process.exit(failed ? 1 : 0);

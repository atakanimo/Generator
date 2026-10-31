/**
 * List filter gate: generating from the manifest gives the same filters whichever path loaded the model.
 *
 * Regression: `.NET` generated the target module from the raw manifest row (number without `filter.type` → range)
 * and every other module from entity file + manifest (`mergeModel`, → eq), so each `host.mjs generate` run flipped
 * range ↔ equals in modules it was not asked to generate.
 *
 *  - .NET host (`scripts/verify/out/filter-determinism/`): models saved through the model editor, then every raw
 *    manifest row generated the way `scripts/host.mjs` does → no file written; one entity alone → no file written.
 *  - Per field: .NET filters, Python `FILTERS`, admin config, client query type and the schema designer default
 *    all apply `effectiveFilterType` (no `filter.type` on a number → eq; range only when the manifest says so).
 *
 * Run: node scripts/verify/filter-determinism.mjs   (no dotnet build; a few seconds)
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'scripts/verify/out/filter-determinism');
const outfile = join(root, 'scripts/verify/out/.harness/filter-bundle.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(root, 'scripts/verify/_filter-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(api) {
    api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };', loader: 'js' }));
  } }]
});
const gen = await import(pathToFileURL(outfile).href);

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}

const field = (name, kind, extra = {}) => ({ name, kind, isArray: false, required: false, ...extra });
// SharedFrame Events shape: numbers with no `filter` key next to explicit range / eq / mismatched choices.
const models = [
  {
    schemaVersion: 2,
    entityName: 'Gadgets',
    fields: [
      field('name', 'string', { required: true }),
      field('guestLimit', 'number', { numberFormat: 'int' }),
      field('uploadedBytes', 'number'),
      field('price', 'decimal'),
      field('weight', 'number', { filter: { searchable: true, type: 'range' } }),
      field('cost', 'decimal', { filter: { searchable: true, type: 'range' } }),
      field('rating', 'number', { filter: { searchable: true, type: 'regex' } }),
      field('code', 'string', { filter: { searchable: true, type: 'eq' } }),
      field('isActive', 'boolean'),
      field('releasedAt', 'date'),
      field('status', 'enum', { enum: { values: ['draft', 'live'] } })
    ],
    timestamps: { createdAt: true, updatedAt: true },
    api: { admin: true }
  },
  {
    schemaVersion: 2,
    entityName: 'Parts',
    fields: [
      field('gadgetId', 'reference', { required: true, reference: { target: 'Gadgets', display: 'name' } }),
      field('quantity', 'number', { numberFormat: 'int' })
    ],
    timestamps: { createdAt: true, updatedAt: true },
    api: { admin: true }
  }
];

// 1. .NET host: model editor save, then `host.mjs generate` (raw manifest rows) must write nothing.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const db = { database: 'postgres', idType: 'uuid-v7' };
const boot = gen.bootstrapDotnetProject(out, 'FilterHost', db);
check('bootstrap', boot.success, boot.error);
for (const model of models) {
  const r = gen.writeDotnetModel(out, { model });
  check(`model editor save ${model.entityName}`, r.success, r.error);
}
const rows = gen.readWorkspaceManifest(out)?.models ?? [];
check('manifest has every model', rows.length === models.length, rows.map(r => r.model.entityName));
for (const row of rows) {
  const r = gen.generateDotnetBackend(out, row.model);
  check(`host.mjs generate ${row.model.entityName} writes nothing`, r.success && r.writtenFiles.length === 0, r.writtenFiles ?? r.error);
}
const allThenOne = [...rows.map(r => r.model), rows[rows.length - 1].model]
  .flatMap(m => gen.generateDotnetBackend(out, m).writtenFiles ?? ['error']);
check('generate all, then one entity again: no file written', allThenOne.length === 0, allThenOne);

// 2. Same filter on every path, from raw rows and from the merged (editor) models alike.
const merged = gen.loadDotnetModels(gen.findDotnetHost(out)).map(m => m.model);
const contractName = { eq: 'eq', regex: 'regex', range: 'range', 'date-range': 'date-range', boolean: 'boolean', enum: 'enum', reference: 'reference' };
function dotnetFilters(list) {
  const result = new Map();
  for (const ctx of gen.buildDotnetModuleContexts('FilterHost', list, gen.dotnetDbProvider(db))) {
    const text = JSON.stringify(ctx);
    for (const m of list) for (const f of m.fields) {
      const p = f.name[0].toUpperCase() + f.name.slice(1);
      const type =
        new RegExp(`RangeFilter<[^>]+>\\? ${p} `).test(text) ? 'range'
        : new RegExp(`DateRangeFilter\\? ${p} `).test(text) ? 'date-range'
        : new RegExp(`WhereContains\\(x => x\\.${p},`).test(text) ? 'regex'
        : new RegExp(`WhereIn\\(x => x\\.${p}, filters\\.${p}\\)`).test(text) ? (f.kind === 'reference' ? 'reference' : 'enum')
        : new RegExp(`bool\\? ${p} `).test(text) ? 'boolean'
        : new RegExp(`WhereEquals\\(x => x\\.${p},`).test(text) ? 'eq'
        : undefined;
      if (text.includes(`"entity":"${m.entityName.replace(/s$/, '')}"`) || type) result.set(`${m.entityName}.${f.name}`, type ?? result.get(`${m.entityName}.${f.name}`));
    }
  }
  return result;
}
function pythonFilters(list) {
  const result = new Map();
  for (const ctx of gen.buildPythonModuleContexts('app', list)) {
    const text = JSON.stringify(ctx);
    for (const [, name, type] of text.matchAll(/\\"(\w+)\\": FilterField\(\\"\w+\\", \\"([\w-]+)\\"\)/g)) {
      const model = list.find(m => m.fields.some(f => f.name === name) && text.includes(m.entityName.replace(/s$/, '')));
      if (model) result.set(`${model.entityName}.${name}`, type === 'id' ? 'reference' : type);
    }
  }
  return result;
}
function adminFilter(list, model, name) {
  const f = gen.toAdminResourceConfig({ model, endpoint: '' }).config.fields.find(c => c.name === name)?.filter;
  return f === 'relation' ? 'reference' : f;
}
function clientFilter(list, model, name) {
  const prop = gen.buildClientModuleContext({ model, models: list, endpoint: '/api/x', preset: gen.REDUX_WEB_PRESET, optionalAsNull: true })
    .queryProps.find(p => p.name === name);
  if (!prop) return undefined;
  if (prop.type.includes('{ min?')) return 'range';
  if (prop.type.includes('from?')) return 'date-range';
  return prop.type;
}

for (const [label, list] of [['raw manifest rows', rows.map(r => r.model)], ['merged (editor) models', merged]]) {
  const dn = dotnetFilters(list);
  const py = pythonFilters(list);
  for (const model of list) for (const f of model.fields) {
    if (f.name === 'createdAt' || f.name === 'updatedAt') continue;
    const key = `${model.entityName}.${f.name}`;
    const expected = contractName[gen.effectiveFilterType(f)];
    check(`${label} ${key}: .NET ${expected}`, dn.get(key) === expected, dn.get(key));
    check(`${label} ${key}: Python ${expected}`, py.get(key) === expected, py.get(key));
    // Admin / client list only `searchable: true` fields (raw rows without a `filter` key have none).
    if (f.filter?.searchable === true) {
      check(`${label} ${key}: admin ${expected}`, adminFilter(list, model, f.name) === expected, adminFilter(list, model, f.name));
      const client = clientFilter(list, model, f.name);
      const clientOk = expected === 'range' || expected === 'date-range' ? client === expected : client !== undefined && client !== 'range' && client !== 'date-range';
      check(`${label} ${key}: client ${expected}`, clientOk, client);
    }
  }
}

// 3. Rule itself: number / decimal without a filter type → eq (designer default too); range only when chosen.
const g = models[0].fields;
const rule = [['guestLimit', 'eq'], ['price', 'eq'], ['weight', 'range'], ['cost', 'range'], ['rating', 'eq'], ['code', 'eq'], ['name', 'regex']];
for (const [name, want] of rule) check(`rule ${name} → ${want}`, gen.effectiveFilterType(g.find(f => f.name === name)) === want);
for (const f of g.filter(f => !f.filter)) {
  // Resolved, not stored: the designer has no `enum` token and stores `eq`, which resolves to `enum`.
  const designer = gen.effectiveFilterType(gen.enrichFieldWithUIConfig(f));
  check(`designer default ${f.name} = emitter default`, designer === gen.effectiveFilterType(f), designer);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

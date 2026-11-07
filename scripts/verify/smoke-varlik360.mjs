/**
 * Varlik360 golden-set smoke: parse (v2) → fieldKind → model editor draft → model.hbs emit.
 * Run: node scripts/verify/smoke-varlik360.mjs
 */
import { build } from 'esbuild';
import { readdirSync, unlinkSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const varlikModules = '/Users/atakanatabey/Projects/VarlikALL/Varlik360/src/modules';

const GOLDEN = [
  'app-version-configs',
  'audit-log',
  'daily-portfolio',
  'fund-daily-metrics',
  'ip-blacklist',
  'notifications',
  'subscriptions',
  'symbol-types',
  'symbols',
  'transactions',
  'user-asset-categories',
  'user-subscriptions',
  'user-watch-list',
  'users'
];

async function loadBundled() {
  const outDir = mkdtempSync(join(tmpdir(), 'gen-smoke-'));
  const outfile = join(outDir, 'smoke-bundle.mjs');
  await build({
    entryPoints: [join(root, 'scripts/verify/_smoke-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    plugins: [
      {
        name: 'stub-electron',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^electron$/ }, () => ({
            path: 'electron',
            namespace: 'stub-electron'
          }));
          buildApi.onLoad({ filter: /.*/, namespace: 'stub-electron' }, () => ({
            contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };',
            loader: 'js'
          }));
        }
      }
    ],
    logLevel: 'silent'
  });
  const mod = await import(pathToFileURL(outfile).href);
  return { mod, outfile };
}

function findModels() {
  return GOLDEN.map(name => {
    const path = join(varlikModules, name, `${name}.model.ts`);
    let missing = false;
    try {
      readdirSync(dirname(path));
    } catch {
      missing = true;
    }
    return { name, path, missing };
  });
}

async function main() {
  const { mod, outfile } = await loadBundled();
  const {
    parseNormalizedModel,
    loadModelDraft,
    classifyField,
    emitZodFieldExpr,
    toTemplateView,
    editorTypeOf,
    editorSubTypeOf,
    subReferenceOf,
    renderModelHbs
  } = mod;

  const models = findModels();
  const rows = [];
  let fail = 0;

  for (const m of models) {
    if (m.missing) {
      rows.push({ model: m.name, ok: false, err: 'missing file' });
      fail++;
      continue;
    }
    const parse = parseNormalizedModel(m.path, 'nodejs-mongoose');
    if (!parse.success || !parse.model?.fields?.length) {
      rows.push({ model: m.name, ok: false, err: parse.error || 'empty fields' });
      fail++;
      continue;
    }

    const md = loadModelDraft(m.path, 'nodejs-mongoose');
    if (!md.success || !md.draft) {
      rows.push({ model: m.name, ok: false, err: md.error || 'model draft fail' });
      fail++;
      continue;
    }

    const kinds = {};
    const zodSnips = {};
    const viewFields = parse.model.fields.map(toTemplateView);
    for (const f of viewFields) {
      if (['_id', 'createdAt', 'updatedAt'].includes(f.name)) continue;
      const { kind } = classifyField(f);
      kinds[f.name] = kind + (f.isArray ? '[]' : '');
      zodSnips[f.name] = emitZodFieldExpr(f, 'create');
    }

    const norm = md.draft.model.fields;
    const issues = [];
    const rendered = renderModelHbs(md.draft);

    if (m.name === 'user-asset-categories') {
      const items = viewFields.find(f => f.name === 'items');
      const mdItems = norm.find(f => f.name === 'items');
      if (classifyField(items || {}).kind !== 'nestedObjectArray') issues.push('items kind!=nestedObjectArray');
      if (!items?.isArray || items?.type !== 'object') issues.push('items parse not object+isArray');
      if (!mdItems?.isArray || editorTypeOf(mdItems) !== 'Object') issues.push('items draft not Object+isArray');
      const st = (items?.objectFields || []).find(s => s.name === 'symbolTypeId');
      const stType = String(st?.type || '').toLowerCase();
      if (!st || (stType !== 'schema' && stType !== 'objectid')) issues.push(`items.symbolTypeId bad type=${st?.type}`);
      if (!st?.includeRelation || st?.relationEntityName !== 'SymbolTypes') issues.push('items.symbolTypeId missing ref');
      const mdSt = (mdItems?.object?.fields || []).find(s => s.name === 'symbolTypeId');
      if (!mdSt || editorSubTypeOf(mdSt) !== 'ObjectId' || subReferenceOf(mdSt) !== 'SymbolTypes') issues.push('draft symbolTypeId not ObjectId+ref');
      if (!String(zodSnips.items || '').includes('z.array(z.object')) issues.push('Zod items not z.array(z.object)');
      if (!rendered.includes('type: [UserAssetCategoryItemSchema]')) issues.push('model.hbs missing items array named schema');
      if (!rendered.includes("ref: 'SymbolTypes'")) issues.push('model.hbs missing nested SymbolTypes ref');
      if (rendered.includes('Schema.Types.Mixed') && /items:[\s\S]*Mixed/.test(rendered)) {
        issues.push('items collapsed to Mixed');
      }
    }
    if (m.name === 'subscriptions') {
      const limits = viewFields.find(f => f.name === 'limits');
      if (classifyField(limits || {}).kind !== 'nestedObject') issues.push('limits kind!=nestedObject');
      if (limits?.isArray) issues.push('limits unexpectedly array');
      const mdLimits = norm.find(f => f.name === 'limits');
      if (!mdLimits || editorTypeOf(mdLimits) !== 'Object' || mdLimits.isArray) issues.push('limits draft regress');
      if (!rendered.includes('SubscriptionLimitsSchema') && !rendered.includes('limits:')) {
        issues.push('limits emit missing');
      }
    }
    if (m.name === 'daily-portfolio') {
      const pv = viewFields.find(f => f.name === 'portfolioValues');
      if (classifyField(pv || {}).kind !== 'nestedObjectArray') issues.push('portfolioValues kind');
      if (!rendered.includes('type: [') || !/portfolioValues:[\s\S]*type:\s*\[/.test(rendered)) {
        issues.push('portfolioValues not array-of-schema in model.hbs');
      }
    }

    for (const f of norm) {
      if (f.kind === 'object' && f.isArray && !(f.object?.fields?.length)) {
        issues.push(`${f.name}: Object+isArray without sub-fields`);
      }
      if (f.kind === 'map' && f.object?.fields) issues.push(`${f.name}: Map should not carry sub-fields`);
    }

    const ok = issues.length === 0;
    if (!ok) fail++;
    rows.push({
      model: m.name,
      ok,
      fields: parse.model.fields.length,
      kinds,
      issues: issues.length ? issues : undefined
    });
  }

  console.log(JSON.stringify({ fail, total: rows.length, rows }, null, 2));
  try {
    unlinkSync(outfile);
  } catch {
    /* ignore */
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * Client data-layer gate (plan client-data-layer C1–C2): Varlik360 models → `redux-rn` services, thunks and slice parts
 * in a throw-away copy of `apps/mobile/src` (inside `apps/mobile`, so its tsconfig, aliases and node_modules resolve),
 * then `tsc`.
 *
 * Checks: generated files compile (mobile baseline stays), operations match `resolveNormalApi`, a second generate
 * writes nothing, existing files are never touched, the extension contract compiles (extended state, hooks that
 * dispatch the module's own thunks), and the reducers behave (real store, fake `API`). `--adopt` also swaps each old
 * Generator-made service / thunk / slice for the created-once stub (the C3 migration) and reports the tsc errors that
 * leaves in screens (informational).
 *
 * Run: node scripts/verify/regen-client.mjs [--adopt] [--keep]
 * Output for review: scripts/verify/out/client/<generated files>.
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const varlik = '/Users/atakanatabey/Projects/VarlikALL/Varlik360';
const mobile = join(varlik, 'apps/mobile');
const copy = join(mobile, '.gen-client-check');
const review = join(root, 'scripts/verify/out/client');
const adopt = process.argv.includes('--adopt');
const keep = process.argv.includes('--keep');
/** Modules the mobile app takes from the Generator today (plan §5). */
const MOBILE = ['AppVersionConfigs', 'DailyPortfolio', 'Notifications', 'SymbolTypes', 'Symbols', 'Transactions', 'UserAssetCategories', 'UserWatchList', 'Users'];
const MOBILE_TSC_BASELINE = 2;

const outfile = join(root, 'scripts/verify/out/.harness/client-bundle.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(root, 'scripts/verify/_client-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(api) {
    api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };', loader: 'js' }));
  } }]
});
const b = await import(pathToFileURL(outfile).href);

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// Models: Varlik360's own manifest (read only) over the parsed model files.
const manifest = JSON.parse(readFileSync(join(varlik, '.generator/manifest.json'), 'utf8'));
const cwd = process.cwd();
process.chdir(join(root, 'scripts/verify/out'));
const allModels = manifest.models.map(r => {
  const parsed = b.parseNormalizedModel(join(varlik, r.sourceRelativePath), 'nodejs-mongoose');
  return b.mergeModel(parsed.model, b.findManifestModelByRelativePath(varlik, r.sourceRelativePath), 'nodejs-mongoose');
});
process.chdir(cwd);
const models = MOBILE.map(name => {
  const m = allModels.find(x => x.entityName === name);
  check(m, `model ${name} not in the manifest`);
  return m;
}).filter(Boolean);

// Copy of the mobile sources (+ the files its tsconfig includes).
rmSync(copy, { recursive: true, force: true });
mkdirSync(copy, { recursive: true });
cpSync(join(mobile, 'src'), join(copy, 'src'), { recursive: true });
for (const f of ['env.d.ts', 'global.d.ts']) if (existsSync(join(mobile, f))) cpSync(join(mobile, f), join(copy, f));
if (existsSync(join(mobile, 'custom-packages'))) cpSync(join(mobile, 'custom-packages'), join(copy, 'custom-packages'), { recursive: true });
const tsconfig = JSON.parse(readFileSync(join(mobile, 'tsconfig.json'), 'utf8'));
writeFileSync(join(copy, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
const servicesDir = join(copy, b.REDUX_RN_PRESET.dirs.services);
const layerDirs = Object.values(b.REDUX_RN_PRESET.dirs).map(d => join(copy, d));
// Yalnız katman klasörlerindeki dosyalar (`services/api/` gibi alt klasörler üretilmez).
const snapshot = () => Object.fromEntries(layerDirs.flatMap(d => readdirSync(d, { withFileTypes: true }).filter(e => e.isFile()).map(e => [join(d, e.name), readFileSync(join(d, e.name), 'utf8')])));
const before = snapshot();

const now = new Date(2026, 9, 21, 12, 0, 0);
/** Per-model layers as the mobile takes them (C4 stores this per model): user state lives in `auth.slice`. */
const NO_SLICE = new Set(['Users']);
const run = () => {
  const common = { clientRoot: copy, preset: b.REDUX_RN_PRESET, allModels, backendRoot: varlik, baseUrl: '/api', now };
  const parts = [
    b.generateClientModules({ ...common, models: models.filter(m => !NO_SLICE.has(m.entityName)) }),
    b.generateClientModules({ ...common, models: models.filter(m => NO_SLICE.has(m.entityName)), layers: { slice: false } })
  ];
  return { files: parts.flatMap(p => p.files), modules: parts.flatMap(p => p.modules), warnings: parts.flatMap(p => p.warnings), notes: parts.flatMap(p => p.notes) };
};
const first = run();
for (const w of first.warnings) console.log(`  warn: ${w}`);

// Operations = normal API surface; nothing else is generated.
for (const ctx of first.modules) {
  const file = readFileSync(join(servicesDir, `${ctx.camel}.service.generated.ts`), 'utf8');
  const expected = b.resolveNormalApi(models.find(m => m.entityName === ctx.entity)).operations;
  const fns = { list: /export const getAll\b/, getOne: /export const getById\b/, create: /export const create\b/, update: /export const update\b/, delete: new RegExp(`export const ${ctx.names.deleteFn}\\b`) };
  for (const [op, re] of Object.entries(fns)) check(re.test(file) === expected.includes(op), `${ctx.entity}: ${op} ${expected.includes(op) ? 'missing' : 'should not be generated'}`);
  check(!/\b_id\b/.test(file), `${ctx.entity}: \`_id\` on the wire`);
  const thunkFile = join(copy, b.REDUX_RN_PRESET.dirs.thunks, `${ctx.camel}.thunk.generated.ts`);
  check(existsSync(thunkFile) === ctx.hasOps, `${ctx.entity}: thunk file ${ctx.hasOps ? 'missing' : 'without operations'}`);
  if (ctx.hasOps) {
    const thunks = readFileSync(thunkFile, 'utf8');
    const names = { list: `fetch${ctx.entity}List`, getOne: `fetch${ctx.entity}ById`, create: `create${ctx.entity}`, update: `update${ctx.entity}`, delete: `delete${ctx.entity}` };
    for (const [op, name] of Object.entries(names)) check(new RegExp(`const ${name} = createAsyncThunk`).test(thunks) === expected.includes(op), `${ctx.entity}: thunk ${name}`);
  }
}

// Ownership: existing files (old Generator-made ones included) stay — K files are created only when missing.
for (const [f, content] of Object.entries(before)) {
  if (f.includes('.generated.')) continue; // G files are the Generator's to rewrite
  check(readFileSync(f, 'utf8') === content, `${relative(copy, f)} was modified`);
}
const created = first.files.filter(f => f.action === 'created' && !f.path.includes('.generated.')).map(f => relative(copy, f.path));
console.log(`  created user-owned files: ${created.join(', ') || '(none: all exist)'}`);
for (const n of first.notes) console.log(`  note: ${n}`);

// Idempotent: the second run writes nothing.
const second = run();
const rewritten = second.files.filter(f => f.action === 'created' || f.action === 'updated');
check(rewritten.length === 0, `second generate wrote: ${rewritten.map(f => relative(copy, f.path)).join(', ')}`);

// Review copy of what was generated.
rmSync(review, { recursive: true, force: true });
for (const f of first.files.filter(x => x.action === 'created' || x.action === 'updated')) {
  const dest = join(review, relative(copy, f.path));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(f.path, dest);
}

// Extension contract (plan §2 #5, #6): extended state + own reducers + a hook that dispatches the module's own thunk.
writeFileSync(join(copy, 'src/__clientExtensionCheck.ts'), `
import { createSlice } from '@reduxjs/toolkit';
import { createTransactionsThunks } from '@/store/thunks/transactions.thunk.generated';
import { TransactionsBaseState, addTransactionsBaseCases, transactionsBaseReducers, transactionsInitialState } from '@/store/slices/transactions.slice.generated';

export const thunks = createTransactionsThunks({
  listDefaults: { page: 1, limit: 20 },
  afterUpdate: (result, _arg, { dispatch }) => {
    if (result.isSuccess) dispatch(thunks.fetchTransactionsList({ page: 1 }));
  }
});
type State = TransactionsBaseState & { unread: number };
const initialState: State = { ...transactionsInitialState, unread: 0 };
export const slice = createSlice({
  name: 'check',
  initialState,
  reducers: { ...transactionsBaseReducers, bump: state => { state.unread += 1; } },
  extraReducers: builder => {
    addTransactionsBaseCases(builder, thunks);
    builder.addMatcher(thunks.deleteTransactions.fulfilled.match, state => { state.unread = 0; });
  }
});

// A field the BE adds outside the model (user file): module augmentation of the generated row type.
declare module '@/services/users.service.generated' {
  interface IUsers { nameInitial?: string }
}
import type { IUsers } from '@/services/users.service.generated';
export const initial = (u: IUsers): string | undefined => u.nameInitial;
`);

const tsc = () => {
  const r = spawnSync('npx', ['tsc', '--noEmit', '-p', copy], { cwd: mobile, encoding: 'utf8' });
  return `${r.stdout}${r.stderr}`.split('\n').filter(l => l.includes('error TS'));
};
const errors = tsc();
check(!errors.some(l => l.includes('.generated.ts')), `generated files have tsc errors:\n${errors.filter(l => l.includes('.generated.ts')).join('\n')}`);
check(errors.length <= MOBILE_TSC_BASELINE, `mobile tsc ${errors.length} > baseline ${MOBILE_TSC_BASELINE}:\n${errors.join('\n')}`);
check(!errors.some(l => l.includes('__clientExtensionCheck')), `extension contract does not compile:\n${errors.filter(l => l.includes('__clientExtensionCheck')).join('\n')}`);
console.log(`Generated ${first.modules.length} modules; tsc ${errors.length} (baseline ${MOBILE_TSC_BASELINE}).`);

// Reducers on a real store; `API` is a fake that answers per URL.
writeFileSync(join(copy, 'src/__clientRuntimeCheck.ts'), `
import { configureStore } from '@reduxjs/toolkit';
import { createTransactionsThunks } from '@/store/thunks/transactions.thunk.generated';
import { createSlice } from '@reduxjs/toolkit';
import { addTransactionsBaseCases, transactionsBaseReducers, transactionsInitialState } from '@/store/slices/transactions.slice.generated';
export const calls: any[] = [];
const thunks = createTransactionsThunks({ listDefaults: { limit: 2 }, mapRow: row => ({ ...row, notes: row.notes ?? 'mapped' }), requestOptions: { update: { headers: { premiumUx: 'paywall' } } } });
const slice = createSlice({ name: 'transactions', initialState: transactionsInitialState, reducers: transactionsBaseReducers, extraReducers: b => addTransactionsBaseCases(b, thunks) });
// The user-file pattern (plan §2 #6): own state + a matcher on a generated action after the base cases.
const extended = createSlice({
  name: 'extended',
  initialState: { ...transactionsInitialState, deletes: 0 },
  reducers: transactionsBaseReducers,
  extraReducers: b => {
    addTransactionsBaseCases(b, thunks);
    b.addMatcher(thunks.deleteTransactions.fulfilled.match, state => { state.deletes += 1; });
  }
});
export const store = configureStore({ reducer: { transactions: slice.reducer, extended: extended.reducer } });
export { thunks };
`);
const runtimeOut = join(root, 'scripts/verify/out/.harness/client-runtime.mjs');
await build({
  entryPoints: [join(copy, 'src/__clientRuntimeCheck.ts')], bundle: true, platform: 'node', format: 'esm', outfile: runtimeOut, logLevel: 'silent',
  nodePaths: [join(mobile, 'node_modules'), join(varlik, 'node_modules')],
  plugins: [{ name: 'host-stubs', setup(api) {
    api.onResolve({ filter: /^@\/services\/api$/ }, () => ({ path: 'api', namespace: 'stub' }));
    api.onResolve({ filter: /^@\/types$/ }, () => ({ path: 'types', namespace: 'stub' }));
    api.onResolve({ filter: /^@\// }, a => ({ path: join(copy, 'src', a.path.slice(2)) + '.ts' }));
    api.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: 'export const API = async cfg => globalThis.__clientFakeApi(cfg);', loader: 'js' }));
    api.onLoad({ filter: /^types$/, namespace: 'stub' }, () => ({ contents: 'export {};', loader: 'js' }));
  } }]
});
{
  const sym = id => ({ id, value: id, displayText: { tr: id, en: id }, currency: 'TRY' });
  const row = (id, symbolId = 's1') => ({ id, userId: { id: 'u1', email: 'a@b.c' }, symbolId: sym(symbolId), quantity: 1, price: 1, transactionType: 'buy', priceCurrency: 'TRY', addToCashBalance: true, createdAt: 'x', updatedAt: 'x' });
  const ok = data => ({ isSuccess: true, data, uiMessage: '', errorData: null });
  const seen = [];
  globalThis.__clientFakeApi = async cfg => {
    seen.push(cfg);
    if (cfg.url.endsWith('/get-all')) {
      const page = cfg.data.page ?? 1;
      return ok({ items: page === 1 ? [row('t1'), row('t2')] : [row('t3')], total: 3, hasMore: page === 1, currentPage: page, currentLimit: 2 });
    }
    if (cfg.url.includes('/update/')) return ok({ ...row(cfg.url.split('/').pop()), symbolId: cfg.data.symbolId ?? 's1', userId: 'u1', quantity: cfg.data.quantity ?? 1 });
    if (cfg.method === 'DELETE') return ok(null);
    if (cfg.method === 'GET') return ok(row(cfg.url.split('/').pop()));
    throw new Error(`unexpected ${cfg.method} ${cfg.url}`);
  };
  const { store, thunks } = await import(pathToFileURL(runtimeOut).href + `?t=${Date.now()}`);
  const st = () => store.getState().transactions;
  await store.dispatch(thunks.fetchTransactionsList());
  check(st().items.map(i => i.id).join() === 't1,t2' && st().hasMore === true, 'list: first page');
  check(seen[0].data.limit === 2 && !seen[0].skipLoading && !seen[0].headers, 'list: listDefaults applied, loading shown');
  check(st().items.every(i => i.notes === 'mapped'), 'list: mapRow applied to every row');
  await store.dispatch(thunks.fetchTransactionsList({ page: 2, append: true }));
  check(st().items.map(i => i.id).join() === 't1,t2,t3', 'list: append adds the next page');
  check(seen[1].skipLoading === true && !seen[1].headers, 'list: append skips the global loading (config flag)');
  await store.dispatch(thunks.updateTransactions({ id: 't2', data: { quantity: 5 } }));
  const t2 = st().items.find(i => i.id === 't2');
  check(t2.quantity === 5 && t2.symbolId.displayText?.tr === 's1' && t2.userId.email === 'a@b.c', 'update: fields merged, populated relations kept');
  check(seen[2].headers?.premiumUx === 'paywall' && seen[2].skipLoading === undefined, 'update: requestOptions headers reach the request');
  await store.dispatch(thunks.updateTransactions({ id: 't2', data: { symbolId: 's9' } }));
  check(JSON.stringify(st().items.find(i => i.id === 't2').symbolId) === '{"id":"s9"}', 'update: changed relation becomes { id }');
  await store.dispatch(thunks.fetchTransactionsById('t1'));
  check(st().currentItem?.id === 't1' && st().currentItem.notes === 'mapped', 'getOne: currentItem, mapRow applied');
  await store.dispatch(thunks.deleteTransactions('t1'));
  check(st().items.map(i => i.id).join() === 't2,t3' && st().total === 2 && st().currentItem === null, 'delete: removed by the thunk argument (data is null)');
  check(store.getState().extended.deletes === 1, 'user slice: matcher on a generated action runs after the base case');
  globalThis.__clientFakeApi = async () => { throw { isSuccess: false, data: null, uiMessage: '', errorData: { message: 'x', code: 500 } }; };
  await store.dispatch(thunks.deleteTransactions('t2'));
  check(st().items.length === 2, 'failed call leaves the state as it is');
  console.log('Reducer checks run on a real store.');
}

if (adopt) {
  // C3 preview: every old Generator-made service / thunk / slice becomes the created-once stub.
  for (const ctx of first.modules) {
    for (const [dir, layer] of [['services', 'service'], ['thunks', 'thunk'], ['slices', 'slice']]) {
      const path = join(copy, b.REDUX_RN_PRESET.dirs[dir], `${ctx.camel}.${layer}.ts`);
      if (existsSync(path) && readFileSync(path, 'utf8').startsWith('// Auto Generated By Generator')) rmSync(path);
    }
  }
  run();
  const adopted = tsc();
  writeFileSync(join(review, 'adopt-tsc.txt'), `${adopted.join('\n')}\n`);
  const byFile = {};
  for (const l of adopted) { const f = l.split('(')[0]; byFile[f] = (byFile[f] ?? 0) + 1; }
  console.log(`--adopt: tsc ${adopted.length} errors (details: ${relative(root, join(review, 'adopt-tsc.txt'))})`);
  for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${f}`);
}

if (!keep) rmSync(copy, { recursive: true, force: true });
if (problems.length) {
  console.error(`FAIL (${problems.length})`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log('OK');

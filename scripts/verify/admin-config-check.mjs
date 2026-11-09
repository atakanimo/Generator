/**
 * Plan 6 §2 gate: `@atakanimo/ata-admin-base` config for every Varlik360 golden-set model.
 * Generates into a throw-away folder inside Varlik360 `apps/admin` (so `@atakanimo/ata-admin-base` resolves), runs `tsc`
 * on the generated files against the package types, checks mapping rules, then removes the folder.
 *
 * Run: node scripts/verify/admin-config-check.mjs [--keep]
 */
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const varlik = '/Users/atakanatabey/Projects/AtaAllWorkspace/Varlik360';
const admin = join(varlik, 'apps/admin');
const fixtureWorkspace = join(root, 'scripts/verify/out/admin-config/workspace');
const out = join(admin, '.gen-admin-config-check');
const MODULES = ['app-version-configs', 'audit-log', 'daily-portfolio', 'fund-daily-metrics', 'ip-blacklist', 'notifications', 'subscriptions', 'symbol-types', 'symbols', 'transactions', 'user-asset-categories', 'user-subscriptions', 'user-watch-list', 'users'];

const outfile = join(root, 'scripts/verify/out/.harness/admin-config-bundle.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(root, 'scripts/verify/_admin-config-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(api) {
    api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };', loader: 'js' }));
  } }]
});
const b = await import(pathToFileURL(outfile).href);

// Model settings: the v3 fixture (Varlik360's own manifest is being re-entered by hand).
rmSync(fixtureWorkspace, { recursive: true, force: true });
mkdirSync(join(fixtureWorkspace, '.generator'), { recursive: true });
cpSync(join(root, 'scripts/verify/fixtures/varlik360.manifest.v3.json'), join(fixtureWorkspace, '.generator/manifest.json'));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'src/modules'), { recursive: true });
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };
const configs = {};
const cwd = process.cwd();
process.chdir(join(root, 'scripts/verify/out'));
for (const mod of MODULES) {
  const rel = `src/modules/${mod}/${mod}.model.ts`;
  const parsed = b.parseNormalizedModel(join(varlik, rel), 'nodejs-mongoose');
  const model = b.mergeModel(parsed.model, b.findManifestModelByRelativePath(fixtureWorkspace, rel), 'nodejs-mongoose');
  const r = b.generateAdminConfig({ model, frontendRoot: out, backendRoot: varlik, baseUrl: '/api' });
  check(r.success, `${mod}: ${r.error}`);
  configs[mod] = b.toAdminResourceConfig({ model, endpoint: '' }).config;
  for (const w of r.warnings ?? []) console.log(`  ! ${mod}: ${w}`);
  for (const s of r.skipped ?? []) console.log(`  - ${mod}: skipped ${s.name} (${s.reason})`);
}
process.chdir(cwd);

// Mapping rules
check(b.findAdminMountPath(varlik, 'symbol-types') === '/api/symboltypes/admin', 'symbol-types mount path');
check(b.findAdminMountPath(varlik, 'user-watch-list') === '/api/userWatchList/admin', 'user-watch-list mount path');
const field = (mod, name) => configs[mod].fields.find(f => f.name === name);
check(!configs['symbol-types'].fields.some(f => f.name === '_id' || f.name === 'id'), 'id field emitted');
check(field('symbol-types', 'countryLabelKey')?.kind === 'enum' && field('symbol-types', 'countryLabelKey')?.nullable === true, 'enum + nullable (countryLabelKey)');
check(field('symbol-types', 'displayText')?.kind === 'object' && field('symbol-types', 'displayText')?.fields?.length === 2, 'inline object (displayText)');
check(field('symbols', 'symbolTypeId')?.kind === 'relation' && field('symbols', 'symbolTypeId')?.ref === 'symbol-types', 'relation ref (symbols.symbolTypeId)');
{
  // Hidden fields (G2) never reach the admin config.
  const rel = 'src/modules/users/users.model.ts';
  const users = b.mergeModel(b.parseNormalizedModel(join(varlik, rel), 'nodejs-mongoose').model, null, 'nodejs-mongoose');
  const hidden = { ...users, fields: users.fields.map(f => (f.name === 'password' ? { ...f, access: { ...f.access, hidden: true } } : f)) };
  // Hidden + writable → write-only form field (never listed / filtered); hidden + readonly → not emitted.
  const pw = b.toAdminResourceConfig({ model: hidden, endpoint: '' }).config.fields.find(f => f.name === 'password');
  check(pw?.writeOnly === true && !pw.list && !pw.filter, 'hidden writable field → writeOnly (users.password)');
  const ro = { ...hidden, fields: hidden.fields.map(f => (f.name === 'password' ? { ...f, access: { ...f.access, readonly: true } } : f)) };
  check(!b.toAdminResourceConfig({ model: ro, endpoint: '' }).config.fields.some(f => f.name === 'password'), 'hidden readonly field emitted (users.password)');
  const labelled = { ...users, ui: { label: 'Kullanıcılar' } };
  check(b.toAdminResourceConfig({ model: labelled, endpoint: '' }).config.label === 'Kullanıcılar', 'model ui.label → resource label');
}
check(field('symbol-types', 'createdAt')?.kind === 'datetime' && field('symbol-types', 'createdAt')?.readonly === true, 'timestamps as readonly datetime');
const daily = field('daily-portfolio', 'portfolioValues');
check(daily?.kind === 'object' && daily?.isArray === true, 'object array (daily-portfolio.portfolioValues)');

check(field('audit-log', 'meta')?.kind === 'json' && field('audit-log', 'meta')?.filter === undefined, 'json field (audit-log.meta)');
{
  // UI choices: ImageField → component 'image'; Default Value → dynamic default (wins over the model default).
  const rel = 'src/modules/symbols/symbols.model.ts';
  const symbols = b.mergeModel(b.parseNormalizedModel(join(varlik, rel), 'nodejs-mongoose').model, null, 'nodejs-mongoose');
  const ui = (name, patch) => (f => (f.name === name ? { ...f, ui: { ...f.ui, ...patch } } : f));
  const edited = { ...symbols, fields: symbols.fields.map(ui('description', { component: 'ImageField' })).map(ui('value', { defaultValue: 'uuid' })).map(ui('createdAt', { defaultValue: 'currentDate' })) };
  const cfg = b.toAdminResourceConfig({ model: edited, endpoint: '' }).config;
  const f = n => cfg.fields.find(x => x.name === n);
  check(f('description')?.component === 'image', 'ImageField → component image');
  check(JSON.stringify(f('value')?.default) === '{"dynamic":"uuid"}', 'uuid default');
  check(JSON.stringify(f('createdAt')?.default) === '{"dynamic":"now"}', 'currentDate default');
  const dir = join(out, 'src/modules/symbolsUi/config');
  mkdirSync(dir, { recursive: true });
  // Rendered file with object literals must type-check too (tsc below).
  const { renderAdminConfigFile } = b;
  if (renderAdminConfigFile) writeFileSync(join(dir, 'symbolsUi.generated.ts'), renderAdminConfigFile(cfg, 'symbolsUiSchema', [], new Date()));
}

// Type check the generated files against the package types (inside apps/admin so imports resolve).
writeFileSync(join(out, 'tsconfig.json'), JSON.stringify({
  extends: '../tsconfig.app.json',
  compilerOptions: { noEmit: true, baseUrl: '.', paths: { axios: ['../../../node_modules/axios'] }, tsBuildInfoFile: null, incremental: false },
  include: ['src/**/*.ts']
}, null, 2));
const tsc = spawnSync('npx', ['tsc', '--noEmit', '-p', join(out, 'tsconfig.json')], { cwd: admin, encoding: 'utf8' });
const errors = `${tsc.stdout}${tsc.stderr}`.split('\n').filter(l => l.includes('error TS'));
for (const e of errors) problems.push(`tsc: ${e}`);

const files = spawnSync('find', [join(out, 'src'), '-name', '*.ts'], { encoding: 'utf8' }).stdout.trim().split('\n').length;
if (!process.argv.includes('--keep')) rmSync(out, { recursive: true, force: true });
console.log(`[admin-config] ${MODULES.length} models → ${files} files, tsc ${errors.length} errors: ${problems.length ? 'FAIL' : 'ok'}`);
for (const p of problems) console.log(`  x ${p}`);
process.exit(problems.length ? 1 : 0);

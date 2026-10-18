/**
 * Plan 6 §5: move one Varlik360 module with the same calls the Generator UI makes —
 * parse + merge (stored settings: Varlik360 manifest row, else the v3 fixture of the old v2 manifest) →
 * set API operations → save to the manifest → generate BE (update mode) → generate the admin FE config.
 *
 * Run: node scripts/verify/migrate-module.mjs <module> --ops list,getOne,update,delete [--no-admin] [--no-auth] [--be-only|--fe-only]
 */
import { build } from 'esbuild';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const varlik = '/Users/atakanatabey/Projects/VarlikALL/Varlik360';
const fixtureWorkspace = join(root, 'scripts/verify/out/admin-config/workspace');

const args = process.argv.slice(2);
const mod = args[0];
const flag = name => args.includes(name);
const opt = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
if (!mod) throw new Error('usage: node scripts/verify/migrate-module.mjs <module> --ops list,getOne,…');

const outfile = join(root, 'scripts/verify/out/.harness/migrate-bundle.mjs');
mkdirSync(dirname(outfile), { recursive: true });
await build({
  entryPoints: [join(root, 'scripts/verify/_migrate-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(api) {
    api.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    api.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const app = { getAppPath: () => process.cwd(), isPackaged: false };', loader: 'js' }));
  } }]
});
const b = await import(pathToFileURL(outfile).href);

const rel = `src/modules/${mod}/${mod}.model.ts`;
const parsed = b.parseNormalizedModel(join(varlik, rel), 'nodejs-mongoose');
if (!parsed.success) throw new Error(parsed.error);
const saved = b.findManifestModelByRelativePath(varlik, rel) ?? b.findManifestModelByRelativePath(fixtureWorkspace, rel);
const merged = b.mergeModel(parsed.model, saved, 'nodejs-mongoose');
const ops = opt('--ops');
const model = {
  ...merged,
  api: {
    ...merged.api,
    ...(ops !== undefined ? { normalOperations: ops ? ops.split(',') : [] } : {}),
    requiresAuth: !flag('--no-auth'),
    admin: !flag('--no-admin')
  }
};

process.chdir(join(root, 'scripts/verify/out')); // generator logs stay out of the repos
const w = b.writeWorkspaceManifestUpdate(varlik, { event: 'save', model: { schema: model, sourceRelativePath: rel } });
if (!w.success) throw new Error(`manifest: ${w.error}`);
console.log(`[migrate] ${mod}: settings saved (${saved ? 'from stored row' : 'defaults'}), normal ops ${JSON.stringify(model.api.normalOperations)}`);

if (!flag('--fe-only')) {
  const be = b.generateBackend(model, varlik, model.api.requiresAuth, 'nodejs-mongoose', true, undefined, true, model.api.admin, undefined);
  if (!be.success) throw new Error(`BE: ${be.error}`);
  console.log(`[migrate] BE: ${Object.keys(be.files ?? {}).join(', ')}`);
}
if (!flag('--be-only')) {
  const fe = b.generateAdminConfig({ model, frontendRoot: join(varlik, 'apps/admin'), backendRoot: varlik, baseUrl: '/api' });
  if (!fe.success) throw new Error(`FE: ${fe.error}`);
  console.log(`[migrate] FE: ${Object.values(fe.files).filter(Boolean).map(f => f.replace(varlik + '/', '')).join(', ')}`);
  for (const w2 of fe.warnings ?? []) console.log(`  ! ${w2}`);
}

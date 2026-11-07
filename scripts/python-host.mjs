#!/usr/bin/env node
/**
 * Python + FastAPI host from the command line (docs/backend/python-fastapi.md), with the same code the app's IPC calls
 * (`project:bootstrapPython`, `project:createModel` / `updateModel`, `project:generateBackend`). Until the
 * "Yeni Python projesi" button exists (plan PY9) this is the way to start a host without the Electron UI.
 *
 *   node scripts/python-host.mjs bootstrap <dir> <AppName>     empty folder → skeleton + core assets + auth + manifest;
 *                                                               first admin + auth modules from the app's own defaults
 *                                                               (`<userData>/auth-defaults.json`), overridden by
 *                                                               AUTH_ADMIN_EMAIL / AUTH_ADMIN_PASSWORD / AUTH_ADMIN_NAME /
 *                                                               AUTH_MODULES (comma list, empty = core only)
 *   node scripts/python-host.mjs model <dir> <models.json>     each NormalizedModel (array or one object) → manifest
 *                                                               row + generate (model editor path)
 *   node scripts/python-host.mjs generate <dir>                regenerate every manifest module
 *   node scripts/python-host.mjs list <dir>                    generated (manifest) and importable (hand-written) modules
 *   node scripts/python-host.mjs preview <dir> <model.py> [Class] [--report] [--json]
 *                                                               import preview (IPC `python:previewImport`): fields,
 *                                                               warnings, unsupported; --report adds the extra-field
 *                                                               report of the local collection; --json prints only the
 *                                                               parsed model (edit it, then `model`). Writes nothing.
 *   node scripts/python-host.mjs import <dir> <model.py> [Class]  import (IPC `python:importModel`) → manifest + generate
 *   node scripts/python-host.mjs show <dir> <Entity>            the manifest row's model as JSON (edit it, then `model`)
 *   node scripts/python-host.mjs admin-config <dir> <feDir> <Entity[,Entity…]>
 *                                                               admin FE config (IPC `generateFrontend`) of manifest
 *                                                               modules into an admin-base host (`<feDir>/src/modules`);
 *                                                               a relative <feDir> is resolved against <dir> (e.g.
 *                                                               `apps/admin`), an absolute one is used as is; endpoint
 *                                                               read from the host's admin routers
 *
 * Output is short on purpose (one line per file / field); the full model only with `show`.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [command, dirArg, extra, extra2] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function usage(message) {
  if (message) console.error(message);
  console.error(
    'Kullanım: node scripts/python-host.mjs bootstrap <dir> <AppName> | model <dir> <models.json> | generate <dir> | list <dir>' +
      ' | preview <dir> <model.py> [Class] [--report] [--json] | import <dir> <model.py> [Class] | show <dir> <Entity>' +
      ' | admin-config <dir> <feDir> <Entity[,Entity…]>'
  );
  process.exit(1);
}

async function loadGenerator() {
  const outfile = join(root, 'scripts/verify/out/.harness/python-host-bundle.mjs');
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
            contents: `export const app = { getAppPath: () => ${JSON.stringify(root)}, isPackaged: false };`,
            loader: 'js'
          }));
        }
      }
    ],
    logLevel: 'silent'
  });
  return import(pathToFileURL(outfile).href);
}

/** Same first admin / modules as the "Yeni proje" dialog (docs/backend/auth.md "İlk admin"); env wins. */
function authOptions() {
  const file = join(homedir(), 'Library/Application Support/universal-code-generator/auth-defaults.json');
  const stored = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const env = process.env;
  const modules = env.AUTH_MODULES !== undefined ? env.AUTH_MODULES.split(',').map((m) => m.trim()).filter(Boolean) : (stored.modules ?? []);
  const admin = {
    email: env.AUTH_ADMIN_EMAIL ?? stored.admin?.email ?? '',
    password: env.AUTH_ADMIN_PASSWORD ?? stored.admin?.password ?? '',
    name: env.AUTH_ADMIN_NAME ?? stored.admin?.name ?? 'Admin'
  };
  if (!admin.email || !admin.password) usage(`İlk admin yok: AUTH_ADMIN_EMAIL + AUTH_ADMIN_PASSWORD ver ya da uygulamada bir proje oluştur (${file}).`);
  return { modules, admin };
}

if (!command || !dirArg) usage();
const dir = resolve(dirArg);
const gen = await loadGenerator();

if (command === 'bootstrap') {
  if (!extra) usage('Uygulama adı eksik (ör. SampleHost).');
  mkdirSync(dir, { recursive: true });
  const res = await gen.bootstrapPythonProject(dir, extra, authOptions());
  if (!res.success) usage(`bootstrap: ${res.error}`);
  console.log(`bootstrap: ${res.files?.length ?? 0} dosya, paket ${gen.toPythonPackageName(extra)} (${dir})`);
  console.log('Sonra: cp .env.example .env (JWT_SECRET en az 32 karakter), uv sync, uv run pytest');
} else if (command === 'model') {
  if (!extra || !existsSync(extra)) usage(`Model dosyası yok: ${extra ?? ''}`);
  const parsed = JSON.parse(readFileSync(extra, 'utf8'));
  for (const model of Array.isArray(parsed) ? parsed : [parsed]) {
    const res = gen.writePythonModel(dir, { model });
    if (!res.success) usage(`${model.entityName}: ${res.error}`);
    console.log(`model: ${model.entityName} → ${res.sourceRelativePath}`);
  }
} else if (command === 'generate') {
  const host = gen.findPythonHost(dir);
  if (!host) usage(`${dir}: Python host değil (pyproject.toml + src/<paket>/core yok).`);
  const result = gen.generatePythonModules(host.root, host.pkg, gen.loadPythonModels(host.root));
  const written = result.files.filter((f) => f.action === 'created' || f.action === 'updated');
  console.log(`generate: ${result.modules.length} modül, ${written.length} dosya yazıldı`);
  for (const f of written) console.log(`  ${f.action}  ${f.path.slice(host.root.length + 1)}`);
} else if (command === 'list') {
  for (const m of gen.listPythonModels(dir)) console.log(`${m.kind.padEnd(10)}  ${m.fileName}${m.entityName ? `  (${m.entityName})` : ''}`);
} else if (command === 'preview' || command === 'import') {
  if (!extra || !existsSync(extra)) usage(`Model dosyası yok: ${extra ?? ''}`);
  const file = resolve(extra);
  const options = extra2 ? { className: extra2 } : {};
  if (command === 'preview') {
    const res = gen.previewPythonImport(dir, file, { ...options, report: flags.includes('--report') });
    if (!res.success) usage(`preview: ${res.error}${res.candidates?.length ? `\nAday sınıflar: ${res.candidates.join(', ')}` : ''}`);
    if (flags.includes('--json')) {
      console.log(JSON.stringify(res.model, null, 2));
      process.exit(0);
    }
    console.log(`preview: ${res.className} → ${res.entityName} (collection ${res.collection})`);
    for (const f of res.model.fields) console.log(`  ${f.name}: ${f.kind ?? f.type}${f.required ? '' : '?'}${f.isArray ? '[]' : ''}`);
    for (const w of res.warnings ?? []) console.log(`  uyarı: ${w}`);
    for (const s of res.suggestions ?? []) console.log(`  öneri: ${typeof s === 'string' ? s : JSON.stringify(s)}`);
    for (const u of res.unsupported ?? []) console.log(`  desteklenmiyor: ${u}`);
    if (res.reportSummary) console.log(`  rapor: ${res.reportSummary}`);
  } else {
    const res = gen.importPythonModel(dir, file, options);
    if (!res.success) usage(`import: ${res.error}`);
    console.log(`import: ${res.entityName} → ${res.sourceRelativePath}, ${res.writtenFiles?.length ?? 0} dosya yazıldı`);
    for (const w of res.warnings ?? []) console.log(`  uyarı: ${w}`);
    for (const n of res.notes ?? []) console.log(`  not: ${n}`);
  }
} else if (command === 'show') {
  if (!extra) usage('Entity adı eksik.');
  const row = gen.readWorkspaceManifest(dir)?.models.find((m) => m.model.entityName === extra);
  if (!row) usage(`Manifest'te ${extra} yok.`);
  console.log(JSON.stringify(row.model, null, 2));
} else if (command === 'admin-config') {
  if (!extra || !extra2) usage('FE klasörü ve entity listesi gerekli (ör. apps/admin SubscriptionPlans,IpBlacklist).');
  const feDir = resolve(dir, extra); // relative → <dir>/<feDir>; absolute stays as is
  const rows = gen.readWorkspaceManifest(dir)?.models ?? [];
  for (const name of extra2.split(',').map((n) => n.trim()).filter(Boolean)) {
    const row = rows.find((m) => m.model.entityName === name);
    if (!row) usage(`Manifest'te ${name} yok.`);
    const res = gen.generateFrontend(row.model, feDir, dir);
    if (!res.success) usage(`${name}: ${res.errors.join('; ')}`);
    console.log(`admin-config: ${name} → ${res.files.config.slice(feDir.length + 1)}${res.files.extension ? ' (+ .generated.ts)' : ''}`);
    for (const w of res.warnings ?? []) console.log(`  uyarı: ${w}`);
  }
} else {
  usage(`Bilinmeyen komut: ${command}`);
}

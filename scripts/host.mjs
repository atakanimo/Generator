#!/usr/bin/env node
/**
 * SharedFrame, AlphaTerminal and Varlik360 from the command line (src/generator-assets/cursor-rules/AtaProjectCommon.mdc).
 * Same functions the Electron IPC calls (`project:generateFrontend`, `project:generateBackend`).
 *
 *   node scripts/host.mjs admin-config <host> [Entity] [--dry-run]
 *   node scripts/host.mjs generate <host> [Entity] [--dry-run]
 *   node scripts/host.mjs client-auth <host> <uygulama> [--dry-run]   # admin / web / mobil auth katmanı
 *   node scripts/host.mjs client <host> <uygulama> [--dry-run]        # uygulamadaki generated modüller + auth yeniden
 *
 * Admin directory: `workspace.frontendPath` when it sits inside the host, otherwise `<host>/apps/admin`.
 * A path that points at another project is ignored. `--dry-run` prints the target and writes nothing.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [command, dirArg, entityArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dryRun = flags.includes('--dry-run');

function usage(message) {
  if (message) console.error(message);
  console.error('Kullanım: node scripts/host.mjs admin-config <host> [Entity] [--dry-run] | generate <host> [Entity] [--dry-run] | client-auth <host> <uygulama> [--dry-run] | client <host> <uygulama> [--dry-run]');
  process.exit(1);
}

async function loadGenerator() {
  const outfile = join(root, 'scripts/verify/out/.harness/host-bundle.mjs');
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, 'scripts/host-entry.ts')],
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

/**
 * Bir istemcinin auth katmanı: G dosyalar her seferinde, K eşleri yalnız yoksa (docs/backend/auth.md). Modüller ve önek
 * host manifest'inden; admin yalnız çekirdek akışları alır. Token öneki ilk yazımda host adından (`<ad>`, admin'de `<ad>admin`), sonra dosyadaki önek korunur.
 */
async function clientAuth(gen, dir, appArg) {
  const app = resolve(appArg);
  if (!existsSync(app)) usage(`Klasör yok: ${app}`);
  const auth = gen.clientAuthFromManifest(dir);
  if (!auth) usage(`${dir}: manifest'te workspace.auth yok.`);
  const { platform } = gen.resolveClientPlatformAt(app);
  if (!platform) usage(`${app}: admin / web / mobil uygulaması değil.`);
  const preset = gen.CLIENT_PRESETS[platform === 'mobile' ? 'redux-rn' : 'redux-web'];
  const name = basename(dir).toLowerCase();
  const options = { ...auth, admin: platform === 'admin', storagePrefix: platform === 'admin' ? `${name}admin` : name };
  if (dryRun) {
    console.log(`dry-run client-auth: ${app} [${platform}, ${preset.id}] modüller: ${options.admin ? 'çekirdek' : auth.modules.join(', ')}, önek ${options.storagePrefix}`);
    return;
  }
  const { files, notes } = gen.generateClientAuthFiles(app, preset, options);
  for (const f of files) console.log(`${f.action.padEnd(18)} ${relative(app, f.path)}`);
  for (const n of notes) console.log(`not: ${n}`);
}

/** Uygulamada `<modül>.service.generated.ts`'i olan modeller, sahip oldukları katmanlarla (thunk / slice) yeniden üretilir. */
async function client(gen, dir, appArg) {
  const app = resolve(appArg);
  const manifest = gen.readWorkspaceManifest(dir);
  if (!manifest) usage(`${dir}: .generator/manifest.json yok.`);
  const { platform } = gen.resolveClientPlatformAt(app);
  if (!platform) usage(`${app}: admin / web / mobil uygulaması değil.`);
  const preset = gen.CLIENT_PRESETS[platform === 'mobile' ? 'redux-rn' : 'redux-web'];
  // .NET'te modelin kaynağı entity dosyalarıdır; manifest'teki kopya eski kalabilir.
  const dotnet = gen.findDotnetHost(dir);
  const allModels = dotnet ? gen.loadDotnetModels(dotnet).map((e) => e.model) : (manifest.models ?? []).map((r) => r.model);
  const has = (layer, model) => existsSync(join(app, preset.dirs[layer === 'service' ? 'services' : `${layer}s`], `${model.entityName[0].toLowerCase()}${model.entityName.slice(1)}.${layer}.generated.ts`));
  const groups = new Map();
  for (const model of allModels.filter((m) => has('service', m))) {
    const key = `${has('thunk', model)}/${has('slice', model)}`;
    groups.set(key, [...(groups.get(key) ?? []), model]);
  }
  for (const [key, models] of groups) {
    const [thunk, slice] = key.split('/').map((v) => v === 'true');
    const label = `${models.map((m) => m.entityName).join(', ')} [service${thunk ? ' + thunk' : ''}${slice ? ' + slice' : ''}]`;
    if (dryRun) {
      console.log(`dry-run client: ${label}`);
      continue;
    }
    const res = gen.generateClientModules({ clientRoot: app, preset, models, allModels, backendRoot: dir, auth: false, layers: { thunk, slice } });
    console.log(`client: ${label}`);
    for (const f of res.files.filter((f) => f.action !== 'unchanged' && f.action !== 'skipped-exists')) console.log(`  ${f.action.padEnd(18)} ${relative(app, f.path)}`);
    for (const w of res.warnings) console.log(`  uyarı: ${w}`);
    for (const n of res.notes) console.log(`  not: ${n}`);
  }
  if (gen.clientAuthFromManifest(dir)) await clientAuth(gen, dir, appArg);
}

async function main() {
  if (!command || !dirArg) usage();
  if (command === 'client-auth' || command === 'client') {
    if (!entityArg) usage();
    const gen = await loadGenerator();
    return command === 'client' ? client(gen, resolve(dirArg), entityArg) : clientAuth(gen, resolve(dirArg), entityArg);
  }
  if (command !== 'admin-config' && command !== 'generate') usage(`Bilinmeyen komut: ${command}`);
  const dir = resolve(dirArg);
  if (!existsSync(dir)) usage(`Klasör yok: ${dir}`);

  const gen = await loadGenerator();
  const manifest = gen.readWorkspaceManifest(dir);
  if (!manifest) usage(`${dir}: .generator/manifest.json yok.`);
  const prefs = gen.getWorkspacePreferences(dir);
  let stack = prefs?.backendStack;
  if (!stack) {
    const detected = await gen.detectProjectStack(dir);
    if (!detected.success || !detected.sourceType) usage(detected.error || 'Yığın tespit edilemedi.');
    stack = detected.sourceType;
  }

  let rows = manifest.models ?? [];
  if (entityArg) {
    const row = rows.find((m) => m.model.entityName === entityArg);
    if (!row) usage(`Manifest'te ${entityArg} yok.`);
    rows = [row];
  }
  if (rows.length === 0) usage('Manifestte model yok.');

  const given = prefs?.frontendPath ? resolve(prefs.frontendPath) : '';
  const fe = gen.adminDir(dir, given);
  if (given && fe !== given) console.error(`frontendPath host dışında, yok sayıldı: ${given}`);
  const baseUrl = gen.parseBaseUrlFromBackend(dir);

  for (const row of rows) {
    const name = row.model.entityName;
    if (command === 'admin-config') {
      if (row.model.api?.admin === false) {
        console.log(`atlandı (admin kapalı): ${name}`);
        continue;
      }
      const moduleName = gen.moduleNameFromEntity(name);
      const configFile = join(fe, 'src', 'modules', moduleName, `${moduleName}.generated.config.ts`);
      if (dryRun) {
        console.log(`dry-run admin-config: ${name} [${stack}] → ${configFile}`);
        continue;
      }
      const res = gen.generateFrontend(row.model, fe, dir, prefs?.features, baseUrl);
      if (!res.success) usage(`${name}: ${(res.errors ?? []).join('; ') || 'admin config yazılamadı'}`);
      console.log(`admin-config: ${name} → ${res.files?.config ?? configFile}`);
      for (const w of res.warnings ?? []) console.log(`  uyarı: ${w}`);
      continue;
    }

    if (dryRun) {
      console.log(`dry-run generate: ${name} [${stack}] → ${dir}`);
      continue;
    }
    const res =
      stack === 'python-fastapi'
        ? gen.generatePythonBackend(dir, row.model)
        : stack === 'dotnet-ef'
          ? gen.generateDotnetBackend(dir, row.model)
          : stack === 'nodejs-mongoose'
            ? gen.generateBackend(
                row.model,
                dir,
                prefs?.isProtectedRoute ?? true,
                'nodejs-mongoose',
                true,
                baseUrl,
                prefs?.updateExistingBackendFiles ?? true,
                row.model.api?.admin !== false,
                prefs?.selectedBackendFiles
              )
            : null;
    if (!res) usage(`Bu yığın komuttan üretilmez: ${stack}`);
    if (!res.success) usage(`${name}: ${res.error || 'backend yazılamadı'}`);
    const written = res.writtenFiles?.length ? res.writtenFiles.join(', ') : Object.values(res.files ?? {}).filter(Boolean).join(', ');
    console.log(`generate: ${name} → ${written || '(dosya listesi boş)'}`);
    for (const note of res.notes ?? []) console.log(`  not: ${note}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

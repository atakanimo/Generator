#!/usr/bin/env node
/**
 * SharedFrame, StockExchange and Varlik360 from the command line (docs/AtaProjectCommon.md).
 * Same functions the Electron IPC calls (`project:generateFrontend`, `project:generateBackend`).
 *
 *   node scripts/host.mjs admin-config <host> [Entity] [--dry-run]
 *   node scripts/host.mjs generate <host> [Entity] [--dry-run]
 *
 * Admin directory: `workspace.frontendPath` when it sits inside the host, otherwise `<host>/apps/admin`.
 * A path that points at another project is ignored. `--dry-run` prints the target and writes nothing.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [command, dirArg, entityArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dryRun = flags.includes('--dry-run');

function usage(message) {
  if (message) console.error(message);
  console.error('Kullanım: node scripts/host.mjs admin-config <host> [Entity] [--dry-run] | generate <host> [Entity] [--dry-run]');
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

async function main() {
  if (!command || !dirArg) usage();
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

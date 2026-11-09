/**
 * Python + FastAPI backend from the app (plan backend-python-fastapi PY4–PY5): new host bootstrap, host detection,
 * generate and model editor create / update.
 *
 * The model's source is the manifest (K1): every Python model is a manifest row whose `sourceRelativePath` is the
 * module's `model_generated.py`. The registry needs the host's whole module list, so every generate regenerates all
 * manifest modules.
 *
 * PY7: project scan (manifest modules + hand-written `modules/<m>/model.py` that can be imported), import of a
 * Pydantic class (`parsePydanticModel` → manifest row → generate) and the extra-field report of its collection.
 */
import {
  AUTH_APPLE_TOKEN_FIELD,
  AUTH_USERS_ENTITY,
  authUsesMail,
  buildAuthUsersModel,
  lockAuthUsersModel,
  normalizeAuthModules,
  type AuthBootstrapOptions,
  type WorkspaceAuth
} from '../../shared/authModules.js';
import { addCryptoExtra, addEnvKeys, bootstrapPythonAuth } from '../generators/python-fastapi/PythonAuthBootstrap.js';
import { pythonAuthNotes, syncPythonAuth } from '../generators/python-fastapi/PythonAuthFiles.js';
import { buildAuthSeedAdmin } from '../utils/authSeed.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { NormalizedModel } from '../../shared/normalizedModel.js';
import type { ModelDraft } from '../../shared/modelDraft.js';
import type { AuthModulesResult, GenerateBackendResult } from '../../shared/ipcTypes.js';
import { onlyHostDatabase } from '../../shared/backendDatabase.js';
import { bootstrapPythonHost } from '../generators/python-fastapi/PythonHostBootstrap.js';
import { generatePythonModules } from '../generators/python-fastapi/PythonFastapiGenerator.js';
import { PythonUnsupportedError, buildPythonModuleContexts, pythonModuleNames } from '../generators/python-fastapi/pythonContext.js';
import { isValidPythonPackage, toPythonPackageName } from '../generators/python-fastapi/pythonLayout.js';
import {
  assertHostDatabase,
  existingHostError,
  getWorkspaceManifestPath,
  readWorkspaceManifest,
  resolveWorkspaceRootForModelFile,
  toProjectRelativePath,
  writeWorkspaceManifestUpdate
} from '../utils/manifestSnapshot.js';
import { log } from '../utils/logger.js';
import { mergeModel } from '../../shared/modelMerge.js';
import type { PythonImportPreview, PythonImportResult, ScannedModel } from '../../shared/ipcTypes.js';
import { PydanticImportError, listPydanticClasses, listPythonModelModules, parsePydanticModel } from '../parsers/python/pydanticModel.js';
import { collectionReport, summarizeReport } from '../parsers/python/mongoReport.js';

export interface PythonBootstrapResponse {
  success: boolean;
  /** Package name used (`src/<package>`). */
  package?: string;
  files?: string[];
  error?: string;
}

export interface PythonHost {
  root: string;
  pkg: string;
}

/** New host in an empty (or new) folder; `app` is turned into a snake_case package name; the manifest records the stack. */
/**
 * New host + the shared auth layer (docs/backend/auth.md): auth files for the picked modules, first admin seed, and the
 * `Users` model (manifest row + generated module). Async for the same signature as the other stacks' bootstraps.
 */
export async function bootstrapPythonProject(root: string, app: string, auth: AuthBootstrapOptions): Promise<PythonBootstrapResponse> {
  try {
    const modules = normalizeAuthModules(auth.modules);
    const admin = buildAuthSeedAdmin(auth.admin);
    const pkg = toPythonPackageName(app);
    if (!isValidPythonPackage(pkg)) {
      return { success: false, error: 'Uygulama adı geçerli bir Python paket adına çevrilemedi (harfle başlamalı), ör. AlphaTerminal → alpha_terminal.' };
    }
    if (existsSync(join(root, 'pyproject.toml'))) {
      return { success: false, error: 'Bu klasörde zaten bir pyproject.toml var.' };
    }
    const hostError = existingHostError(root);
    if (hostError) return { success: false, error: hostError };
    const result = bootstrapPythonHost(root, pkg);
    const authFiles = bootstrapPythonAuth(root, app.trim(), pkg, modules, admin);
    writeWorkspaceManifestUpdate(root, {
      event: 'workspace',
      workspace: { backendStack: 'python-fastapi', ...onlyHostDatabase('python-fastapi'), auth: { modules, appName: app.trim() } }
    });
    const users = writePythonModel(root, { model: buildAuthUsersModel(modules) });
    if (!users.success) return { success: false, error: `Users modeli üretilemedi: ${users.error}` };
    const created = [...result.files, ...authFiles.files]
      .filter((f) => f.action === 'created')
      .map((f) => toProjectRelativePath(root, f.path));
    log(`[python] bootstrap ${pkg}: ${created.length} file(s)`, 'info');
    return { success: true, package: pkg, files: created };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function authHost(root: string): { host: PythonHost; auth: WorkspaceAuth } {
  const host = requireHost(root);
  const auth = readWorkspaceManifest(host.root)?.workspace?.auth;
  if (!auth || !existsSync(join(host.root, 'src', host.pkg, 'modules', 'auth'))) {
    throw new Error("Bu host'ta ortak auth katmanı yok (manifest workspace.auth + modules/auth gerekli).");
  }
  return { host, auth };
}

/** Auth modules + app name of an existing host (manifest `workspace.auth`). */
export function readPythonAuthSettings(root: string): { success: boolean; auth?: WorkspaceAuth; error?: string } {
  try {
    const { auth } = authHost(root);
    return { success: true, auth: { modules: normalizeAuthModules(auth.modules), appName: auth.appName } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Changes the auth modules of an existing host (docs/backend/auth.md "Var olan proje"): without `apply` only lists
 * the auth files that would change. With `apply`: manifest `workspace.auth`, `Users` locked fields, every module
 * regenerated (auth G files included), `.env.example` keys and `PyJWT[crypto]` for the modules turned on.
 */
export function setPythonAuthModules(root: string, input: { modules: readonly string[]; appName?: string }, apply: boolean): AuthModulesResult {
  try {
    const { host, auth } = authHost(root);
    const appName = input.appName?.trim() || auth.appName;
    if (!appName) return { success: false, error: 'Uygulama adı gerekli (auth e-postalarının konusunda geçer).' };
    const modules = normalizeAuthModules(input.modules);
    const files = syncPythonAuth(host.root, host.pkg, appName, modules, false).map((f) => ({ path: toProjectRelativePath(host.root, f.path), action: f.action }));
    const notes = [
      ...pythonAuthNotes(host.root, host.pkg, modules),
      "İstemciler aynı modülleri 'node scripts/host.mjs client-auth <host> <app klasörü>' ile alır."
    ];
    if (!apply) return { success: true, files, notes };
    writeWorkspaceManifestUpdate(host.root, { event: 'workspace', workspace: { auth: { modules, appName } } });
    const users = loadPythonModels(host.root).find((m) => m.entityName === AUTH_USERS_ENTITY);
    if (users) {
      // Apple's token field is locked only with `apple`; turned off, it leaves the model.
      const model = modules.includes('apple') ? users : { ...users, fields: users.fields.filter((f) => f.name !== AUTH_APPLE_TOKEN_FIELD) };
      const written = writePythonModel(host.root, { model });
      if (!written.success) return { success: false, error: `Users modeli üretilemedi: ${written.error}` };
    } else {
      generatePythonModules(host.root, host.pkg, loadPythonModels(host.root));
    }
    // Only the modules turned on now: the host may have wired the existing ones to its own keys.
    const added = modules.filter((m) => !auth.modules.includes(m));
    addCryptoExtra(host.root, added);
    addEnvKeys(host.root, added, authUsesMail(modules) && !authUsesMail(auth.modules));
    log(`[python] auth modules ${host.pkg}: ${modules.join(', ') || '(core)'}`, 'info');
    return { success: true, files, notes };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** `pyproject.toml` + exactly one `src/<pkg>/` package with `core/` (the asset target). */
export function findPythonHost(root: string): PythonHost | null {
  if (!existsSync(join(root, 'pyproject.toml'))) return null;
  const src = join(root, 'src');
  if (!existsSync(src)) return null;
  const packages = readdirSync(src).filter(
    (name) => isValidPythonPackage(name) && statSync(join(src, name)).isDirectory() && existsSync(join(src, name, '__init__.py')) && existsSync(join(src, name, 'core'))
  );
  return packages.length === 1 ? { root, pkg: packages[0] } : null;
}

/** Manifest says `python-fastapi` (bootstrap / editor write it), or the folder is a Python host. */
export function isPythonProject(root: string | undefined): boolean {
  const dir = root?.trim();
  if (!dir) return false;
  return readWorkspaceManifest(dir)?.workspace?.backendStack === 'python-fastapi';
}

function requireHost(root: string): PythonHost {
  const host = findPythonHost(root);
  if (!host) throw new Error('Python host bulunamadı: kökte pyproject.toml ve tek bir src/<paket>/ (core/ ile) gerekli.');
  return host;
}

/** `src/<pkg>/modules/<folder>/model_generated.py` (the manifest row's `sourceRelativePath`). */
export function pythonModelPath(host: PythonHost, entityName: string): string {
  return join(host.root, 'src', host.pkg, 'modules', pythonModuleNames(entityName).folder, 'model_generated.py');
}

/** Manifest models of the host (every Python module the Generator owns). */
export function loadPythonModels(root: string): NormalizedModel[] {
  return (readWorkspaceManifest(root)?.models ?? []).map((row) => row.model);
}

/** Regenerates every manifest module with `schema` replacing (or added to) its own entry. */
export function generatePythonBackend(projectPath: string, input: NormalizedModel): GenerateBackendResult & { filePath?: string } {
  try {
    const host = requireHost(projectPath);
    assertHostDatabase(host.root, 'python-fastapi');
    const auth = readWorkspaceManifest(host.root)?.workspace?.auth;
    const schema = auth ? lockAuthUsersModel(input, auth.modules) : input;
    const own = pythonModelPath(host, schema.entityName);
    const models = loadPythonModels(host.root).filter((m) => m.entityName !== schema.entityName);
    const result = generatePythonModules(host.root, host.pkg, [...models, schema]);
    const changed = result.files.filter((f) => f.action === 'created' || f.action === 'updated');
    const notes: string[] = [];
    const skipped = result.files.filter((f) => f.action === 'skipped-user-owned');
    if (skipped.length) notes.push(`Başlıksız (elle yazılmış) dosyalar atlandı: ${skipped.map((f) => toProjectRelativePath(host.root, f.path)).join(', ')}`);
    log(`[python] generate ${schema.entityName}: ${changed.length} file(s) written`, 'info');
    return {
      success: true,
      filePath: own,
      files: { model: toProjectRelativePath(host.root, own) },
      writtenFiles: changed.map((f) => toProjectRelativePath(host.root, f.path)),
      notes
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[python] generate failed: ${message}`, error instanceof PythonUnsupportedError ? 'warn' : 'error');
    return { success: false, error: message };
  }
}

export interface PythonModelWriteResult {
  success: boolean;
  filePath?: string;
  schema?: NormalizedModel;
  sourceRelativePath?: string;
  manifestPath?: string;
  manifestUpdated?: boolean;
  error?: string;
}

/** Model editor (create / update): the draft becomes the manifest row, then every module is generated. */
export function writePythonModel(projectPath: string, draft: ModelDraft): PythonModelWriteResult {
  try {
    const host = requireHost(projectPath);
    // The auth fields of `Users` stay as the auth layer expects (docs/backend/auth.md).
    const auth = readWorkspaceManifest(host.root)?.workspace?.auth;
    const model = auth ? lockAuthUsersModel(draft.model, auth.modules) : draft.model;
    const filePath = pythonModelPath(host, model.entityName);
    const sourceRelativePath = toProjectRelativePath(host.root, filePath);
    const stash = writeWorkspaceManifestUpdate(host.root, {
      event: 'stash',
      model: { schema: model, sourceRelativePath },
      workspace: { backendStack: 'python-fastapi' }
    });
    if (!stash.success) return { success: false, error: stash.error };
    const generated = generatePythonBackend(host.root, model);
    if (!generated.success) return { success: false, error: generated.error };
    const row = readWorkspaceManifest(host.root)?.models.find((m) => m.sourceRelativePath === sourceRelativePath);
    return {
      success: true,
      filePath,
      schema: row?.model ?? model,
      sourceRelativePath,
      manifestPath: getWorkspaceManifestPath(host.root),
      manifestUpdated: true
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Editor draft of a module (`model_generated.py` path): the manifest row. */
export function loadPythonModelDraft(filePath: string, projectPath?: string): { success: boolean; draft?: ModelDraft; error?: string } {
  try {
    const root = resolveWorkspaceRootForModelFile(projectPath, filePath);
    const rel = toProjectRelativePath(root, filePath);
    const model = readWorkspaceManifest(root)?.models.find((m) => m.sourceRelativePath === rel)?.model;
    if (!model) return { success: false, error: `Manifest'te bu modülün modeli yok: ${rel}` };
    return { success: true, draft: { model: { ...model, fields: model.fields.filter((f) => f.name !== 'createdAt' && f.name !== 'updatedAt') } } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// PY7: scan, import, extra-field report
// ---------------------------------------------------------------------------------------------------------------

/**
 * Models of a Python host: every manifest module (`model_generated.py`, opened in the schema designer / editor) and
 * every hand-written `modules/<m>/model.py` whose module is not in the manifest yet (`importable`: import dialog).
 */
export function listPythonModels(root: string): ScannedModel[] {
  const host = findPythonHost(root);
  if (!host) return [];
  const rows = readWorkspaceManifest(host.root)?.models ?? [];
  const generated = rows.map((row) => {
    const folder = pythonModuleNames(row.model.entityName).folder;
    return { fileName: `${folder}/model_generated.py`, path: join(host.root, row.sourceRelativePath), kind: 'generated' as const, entityName: row.model.entityName };
  });
  const owned = new Set(rows.map((r) => pythonModuleNames(r.model.entityName).folder));
  const importable = listPythonModelModules(join(host.root, 'src', host.pkg))
    .filter((m) => !owned.has(m.folder) && /\bBaseModel\b/.test(readFileSync(m.path, 'utf8')))
    .map((m) => ({ fileName: `${m.folder}/model.py`, path: m.path, kind: 'importable' as const }));
  return [...generated, ...importable];
}

/** Schema designer (`project:parseModel`) for a Python module: the manifest row (K1) and the generated file's path. */
export function loadPythonModelForEditor(filePath: string, projectRoot: string): { success: boolean; model?: NormalizedModel; error?: string } {
  const root = resolveWorkspaceRootForModelFile(projectRoot, filePath);
  const rel = toProjectRelativePath(root, filePath);
  const model = readWorkspaceManifest(root)?.models.find((m) => m.sourceRelativePath === rel)?.model;
  if (!model) {
    return /[\\/]model\.py$/.test(filePath)
      ? { success: false, error: 'Elle yazılmış Python modeli: önce içe aktarın (model listesinde "İçe aktar").' }
      : { success: false, error: `Manifest'te bu modülün modeli yok: ${rel}` };
  }
  return { success: true, model };
}

function parseForImport(host: PythonHost, filePath: string, className?: string) {
  const parsed = parsePydanticModel(filePath, { className, root: host.root });
  // Default UI / filter settings, as a first open in the schema designer gives them.
  const model: NormalizedModel = { ...mergeModel(parsed.model, null, null), api: parsed.model.api };
  return { ...parsed, model };
}

/** Parsed class + (optionally) the extra-field report of its collection; nothing is written. */
export function previewPythonImport(
  projectPath: string,
  filePath: string,
  options: { className?: string; report?: boolean; allowRemote?: boolean; sample?: number } = {}
): PythonImportPreview {
  try {
    const host = requireHost(projectPath);
    const parsed = parseForImport(host, filePath, options.className);
    const names = pythonModuleNames(parsed.model.entityName);
    const report = options.report === false ? undefined : collectionReport(host.root, parsed.model, { collection: names.collection, allowRemote: options.allowRemote, sample: options.sample });
    if (report) log(`[python] import preview ${names.entity}: ${summarizeReport(report)}`, 'info');
    return {
      success: true,
      entityName: names.entity,
      collection: names.collection,
      className: parsed.className,
      candidates: parsed.candidates,
      model: parsed.model,
      warnings: parsed.warnings,
      suggestions: parsed.suggestions,
      unsupported: parsed.unsupported,
      report,
      reportSummary: report ? summarizeReport(report) : undefined
    };
  } catch (error) {
    // No class named like the entity: hand the candidates back so the user can pick the document class.
    let candidates: string[] | undefined;
    try {
      candidates = listPydanticClasses(filePath, projectPath);
    } catch {
      candidates = undefined;
    }
    return { success: false, candidates, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** K files that the generated files rely on but a hand-written module may not have yet (plan §8 step 3). */
function ownedFileNotes(host: PythonHost, entityName: string): string[] {
  const { entity, folder } = pythonModuleNames(entityName);
  const dir = join(host.root, 'src', host.pkg, 'modules', folder);
  const read = (file: string) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : '');
  const notes: string[] = [];
  if (!read('service.py').includes(`def build_${folder}_service`)) {
    notes.push(`modules/${folder}/service.py elle yazılmış: admin_router_generated.py'nin istediği build_${folder}_service yok; ${entity}Service(${entity}ServiceBase) + kurucu eklenmeli (plan §8 adım 3).`);
  }
  if (!new RegExp(`class\\s+${entity}Repository\\s*\\(\\s*${entity}RepositoryBase`).test(read('repository.py'))) {
    notes.push(`modules/${folder}/repository.py elle yazılmış: ${entity}Repository, repository_generated.py'deki ${entity}RepositoryBase'in alt sınıfı olmalı.`);
  }
  if (!read('model.py').includes('model_generated')) {
    notes.push(`modules/${folder}/model.py hâlâ elle yazılmış sınıfı tanımlıyor: sınıf artık model_generated.py'de; model.py re-export'a dönmeli.`);
  }
  return notes;
}

/**
 * Import: the parsed class becomes the module's manifest row and every module is generated (K1). Refused when a
 * field cannot be represented or the module is already in the manifest. Existing K files are kept (notes say what to
 * adapt); the extra-field report is the preview's.
 */
export function importPythonModel(projectPath: string, filePath: string, options: { className?: string } = {}): PythonImportResult {
  try {
    const host = requireHost(projectPath);
    const parsed = parseForImport(host, filePath, options.className);
    if (parsed.unsupported.length) {
      return { success: false, error: `Desteklenmeyen alanlar: ${parsed.unsupported.join('; ')}` };
    }
    const names = pythonModuleNames(parsed.model.entityName);
    const rel = toProjectRelativePath(host.root, pythonModelPath(host, names.entity));
    if (readWorkspaceManifest(host.root)?.models.some((m) => m.sourceRelativePath === rel)) {
      return { success: false, error: `${names.entity} zaten Generator'da (${rel}); model editöründen düzenleyin.` };
    }
    // Generator checks (field names, kinds) before anything is written: a refused model leaves no manifest row.
    buildPythonModuleContexts(host.pkg, [...loadPythonModels(host.root), parsed.model]);
    const stash = writeWorkspaceManifestUpdate(host.root, {
      event: 'stash',
      model: { schema: parsed.model, sourceRelativePath: rel },
      workspace: { backendStack: 'python-fastapi' }
    });
    if (!stash.success) return { success: false, error: stash.error };
    const generated = generatePythonBackend(host.root, parsed.model);
    if (!generated.success) return { success: false, error: generated.error };
    const notes = [...ownedFileNotes(host, names.entity), ...(generated.notes ?? [])];
    log(`[python] import ${parsed.className} → ${names.entity}`, 'info');
    return {
      success: true,
      entityName: names.entity,
      filePath: join(host.root, rel),
      sourceRelativePath: rel,
      writtenFiles: generated.writtenFiles,
      warnings: parsed.warnings,
      notes
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[python] import failed: ${message}`, error instanceof PydanticImportError || error instanceof PythonUnsupportedError ? 'warn' : 'error');
    return { success: false, error: message };
  }
}

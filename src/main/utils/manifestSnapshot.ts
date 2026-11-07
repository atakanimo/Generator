import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { parseNormalizedModel } from '../ipc/schemaParser.js';
import { mergeModel, sanitizeFieldRelationMeta } from '../../shared/modelMerge.js';
import { lockAuthUsersModel } from '../../shared/authModules.js';
import { NORMALIZED_MODEL_VERSION, canonicalModel, type NormalizedModel } from '../../shared/normalizedModel.js';
import type { ManifestWorkspacePrefs } from '../../shared/ipcTypes.js';
import { LEGACY_HOST_DATABASE, hostDatabaseError, type BackendStack, type HostDatabase } from '../../shared/backendDatabase.js';
import { log } from './logger.js';
import { getGeneratorRoot } from './templateHelpers.js';

/**
 * 3: models stored as NormalizedModel v2 (`{ sourceRelativePath, model }`). Older manifests are not read: their
 * model rows are ignored (models are saved again from the files) and the file is backed up before the first write.
 */
export const MANIFEST_VERSION = 3;

/** Backup name for an older manifest replaced by the first v3 write, e.g. `manifest.v2.backup.json`. */
export function manifestBackupFileName(version: number): string {
  return `manifest.v${version}.backup.json`;
}
export const WORKSPACE_GENERATOR_DIR = '.generator';
export const MANIFEST_FILE_NAME = 'manifest.json';

export type { ManifestWorkspacePrefs };

/** Stored manifest row (v3). */
export interface ManifestModelRecord {
  sourceRelativePath: string;
  model: NormalizedModel;
}

export interface WorkspaceManifest {
  manifestVersion: number;
  lastSavedAt?: string;
  lastGeneratedAt?: string;
  generatorVersion?: string;
  workspace?: ManifestWorkspacePrefs;
  models: ManifestModelRecord[];
}

export type ManifestWriteEvent = 'save' | 'generate' | 'stash' | 'workspace' | 'reconcile';

export interface ManifestWriteRequest {
  model?: { schema: NormalizedModel; sourceRelativePath: string };
  workspace?: ManifestWorkspacePrefs;
  event: ManifestWriteEvent;
}

function normalizeFsPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function toProjectRelativePath(projectRoot: string, absoluteFilePath: string): string {
  const root = normalizeFsPath(projectRoot);
  const abs = normalizeFsPath(absoluteFilePath);
  const prefix = `${root}/`;
  if (abs.startsWith(prefix)) {
    return abs.slice(prefix.length);
  }
  return absoluteFilePath.replace(/\\/g, '/');
}

export function getWorkspaceManifestPath(workspaceRoot: string): string {
  return join(workspaceRoot, WORKSPACE_GENERATOR_DIR, MANIFEST_FILE_NAME);
}

function readGeneratorVersion(): string {
  try {
    const pkgPath = join(getGeneratorRoot(), 'package.json');
    if (!existsSync(pkgPath)) return 'unknown';
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Manifests written before `database` / `idType` existed get what their stack generated then (plan
 * backend-dotnet-database-providers K2); the next manifest write persists it. `dotnet-ef` is not filled here: a .NET
 * host can be on any of three databases, so the generator reads it from the project (`resolveDotnetHostDatabase`).
 * An unknown stack is left as is (no fill, the manifest is still read).
 */
function withHostDatabase(workspace: ManifestWorkspacePrefs): ManifestWorkspacePrefs {
  if (!workspace.backendStack || workspace.backendStack === 'dotnet-ef' || (workspace.database && workspace.idType)) {
    return workspace;
  }
  const legacy = LEGACY_HOST_DATABASE[workspace.backendStack as BackendStack] as HostDatabase | undefined;
  if (!legacy) return workspace;
  return { ...workspace, database: workspace.database ?? legacy.database, idType: workspace.idType ?? legacy.idType };
}

/**
 * Express / Python generate: refused when the manifest records a database / id type the stack does not generate for
 * (ör. `python-fastapi` + `postgres`). A manifest without the fields (older hosts) passes. .NET: `resolveDotnetHostDatabase`.
 */
export function assertHostDatabase(workspaceRoot: string, stack: BackendStack): void {
  const workspace = getWorkspacePreferences(workspaceRoot);
  if (!workspace?.database && !workspace?.idType) return;
  const error = hostDatabaseError(stack, { database: workspace.database, idType: workspace.idType });
  if (error) throw new Error(`Manifest (.generator/manifest.json) workspace: ${error}`);
}

/**
 * Bootstrap guard: the stack, database and id type are fixed once a host exists (K2), so a folder whose manifest
 * already names a stack is refused (bootstrapping again would overwrite them and regenerate the host for another
 * database). Each bootstrap also checks its own project files.
 */
export function existingHostError(workspaceRoot: string): string | null {
  const stack = getWorkspacePreferences(workspaceRoot)?.backendStack;
  return stack ? `Bu klasör zaten bir ${stack} projesi (.generator/manifest.json); yeni proje boş bir klasörde kurulur.` : null;
}

function normalizeManifest(raw: unknown): WorkspaceManifest {
  const base: WorkspaceManifest = {
    manifestVersion: MANIFEST_VERSION,
    models: [],
    generatorVersion: readGeneratorVersion()
  };
  if (!raw || typeof raw !== 'object') return base;
  const stored = raw as Omit<WorkspaceManifest, 'models'> & { models?: unknown[] };
  const storedVersion = typeof stored.manifestVersion === 'number' ? stored.manifestVersion : 0;
  const rows = Array.isArray(stored.models) ? stored.models : [];
  return {
    ...base,
    ...stored,
    manifestVersion: MANIFEST_VERSION,
    models: storedVersion >= MANIFEST_VERSION ? (rows as ManifestModelRecord[]) : [],
    workspace: stored.workspace && typeof stored.workspace === 'object' ? withHostDatabase(stored.workspace) : undefined,
    lastSavedAt: stored.lastSavedAt,
    lastGeneratedAt: stored.lastGeneratedAt
  };
}

const warnedOldManifests = new Set<string>();

export function readWorkspaceManifest(workspaceRoot: string): WorkspaceManifest | null {
  const p = getWorkspaceManifestPath(workspaceRoot);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as { manifestVersion?: unknown };
    const version = typeof raw?.manifestVersion === 'number' ? raw.manifestVersion : 0;
    if (version < MANIFEST_VERSION && !warnedOldManifests.has(p)) {
      warnedOldManifests.add(p);
      log(`Manifest v${version} is not supported; its model rows are ignored (models are read from the files) | ${JSON.stringify({ manifestPath: p })}`, 'warn');
    }
    return normalizeManifest(raw);
  } catch {
    return null;
  }
}

export function getWorkspacePreferences(workspaceRoot: string): ManifestWorkspacePrefs | null {
  const man = readWorkspaceManifest(workspaceRoot);
  return man?.workspace ?? null;
}

function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Workspace root for `.generator/manifest.json`: prefer existing manifest (hint or walk up from model file).
 */
export function resolveWorkspaceRootForModelFile(
  projectRootHint: string | undefined,
  absoluteFilePath: string
): string {
  const hint = projectRootHint?.trim();
  if (hint && existsSync(join(hint, WORKSPACE_GENERATOR_DIR, MANIFEST_FILE_NAME))) {
    return hint;
  }
  let dir = dirname(absoluteFilePath);
  for (let i = 0; i < 32; i++) {
    if (existsSync(join(dir, WORKSPACE_GENERATOR_DIR, MANIFEST_FILE_NAME))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return hint || dirname(absoluteFilePath);
}

/** Manifest row matched by `sourceRelativePath` (POSIX); null if workspace has no manifest or no row. */
export function findManifestModelByRelativePath(workspaceRoot: string, sourceRelativePath: string): NormalizedModel | null {
  const man = readWorkspaceManifest(workspaceRoot);
  const key = normalizeRelPath(sourceRelativePath);
  return man?.models.find(m => normalizeRelPath(m.sourceRelativePath) === key)?.model ?? null;
}

function upsertModels(models: ManifestModelRecord[], record: ManifestModelRecord): ManifestModelRecord[] {
  const key = normalizeRelPath(record.sourceRelativePath);
  const normalizedRecord: ManifestModelRecord = { ...record, sourceRelativePath: key };
  const withoutStale = models.filter(m => {
    const mKey = normalizeRelPath(m.sourceRelativePath);
    if (mKey === key) return false;
    if (m.model.entityName === record.model.entityName) return false;
    return true;
  });
  return [...withoutStale, normalizedRecord];
}

/** FE generate options removed in plan 6 §3; old manifests may still carry them. */
const LEGACY_WORKSPACE_KEYS = ['selectedFrontendFiles', 'updateExistingFrontendFiles', 'isAdminUser'] as const;

function withoutLegacyWorkspaceKeys(prefs: ManifestWorkspacePrefs): ManifestWorkspacePrefs {
  const out: Record<string, unknown> = { ...prefs };
  for (const k of LEGACY_WORKSPACE_KEYS) delete out[k];
  return out as ManifestWorkspacePrefs;
}

function mergeWorkspacePrefs(
  prev: ManifestWorkspacePrefs | undefined,
  next: ManifestWorkspacePrefs | undefined
): ManifestWorkspacePrefs | undefined {
  if (!next) return prev ? withoutLegacyWorkspaceKeys(prev) : prev;
  if (!prev) return withoutLegacyWorkspaceKeys({ ...next });
  return {
    ...withoutLegacyWorkspaceKeys(prev),
    ...withoutLegacyWorkspaceKeys(next),
    selectedBackendFiles: next.selectedBackendFiles
      ? { ...prev.selectedBackendFiles, ...next.selectedBackendFiles }
      : prev.selectedBackendFiles,
    features: next.features ? { ...prev.features, ...next.features } : prev.features,
    clientPlatforms: next.clientPlatforms ? { ...prev.clientPlatforms, ...next.clientPlatforms } : prev.clientPlatforms
  };
}

export function applyManifestWrite(prev: WorkspaceManifest | null, request: ManifestWriteRequest): WorkspaceManifest {
  const manifest = normalizeManifest(prev);
  const now = new Date().toISOString();

  if (request.model) {
    const rel = normalizeRelPath(request.model.sourceRelativePath.trim());
    // A host with the shared auth layer keeps the auth fields of `Users` (docs/backend/auth.md).
    const auth = manifest.workspace?.auth ?? request.workspace?.auth;
    const schema = auth ? lockAuthUsersModel(request.model.schema, auth.modules) : request.model.schema;
    // Stored: fields + UI / API settings; timestamps and the mongoose model name always come from the file.
    const model = canonicalModel({
      schemaVersion: NORMALIZED_MODEL_VERSION,
      entityName: schema.entityName,
      fields: schema.fields.map(sanitizeFieldRelationMeta),
      nestedSchemas: schema.nestedSchemas?.map(ns => ({ ...ns, fields: ns.fields.map(sanitizeFieldRelationMeta) })),
      ownership: schema.ownership,
      api: schema.api,
      ui: schema.ui?.label?.trim() ? { label: schema.ui.label.trim() } : undefined
    });
    manifest.models = upsertModels(manifest.models, { sourceRelativePath: rel, model });
  }

  if (request.workspace) {
    manifest.workspace = mergeWorkspacePrefs(manifest.workspace, request.workspace);
  }

  manifest.manifestVersion = MANIFEST_VERSION;
  manifest.generatorVersion = readGeneratorVersion();

  if (request.event === 'save') manifest.lastSavedAt = now;
  else if (request.event === 'generate') manifest.lastGeneratedAt = now;

  return manifest;
}

function writeManifestAtomic(workspaceRoot: string, manifest: WorkspaceManifest): { success: boolean; error?: string; manifestPath?: string } {
  const dir = join(workspaceRoot, WORKSPACE_GENERATOR_DIR);
  const finalPath = join(dir, MANIFEST_FILE_NAME);
  const tmpPath = join(dir, `.${MANIFEST_FILE_NAME}.tmp`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
    renameSync(tmpPath, finalPath);
    return { success: true, manifestPath: finalPath };
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Before the first v3 write over an older manifest, keep that file next to it; never overwritten afterwards. */
function backupOldManifestOnce(workspaceRoot: string): void {
  const dir = join(workspaceRoot, WORKSPACE_GENERATOR_DIR);
  const current = join(dir, MANIFEST_FILE_NAME);
  if (!existsSync(current)) return;
  try {
    const version = (JSON.parse(readFileSync(current, 'utf-8')) as { manifestVersion?: number }).manifestVersion ?? 0;
    const backup = join(dir, manifestBackupFileName(version));
    if (version < MANIFEST_VERSION && !existsSync(backup)) copyFileSync(current, backup);
  } catch (error) {
    log(`Old manifest backup failed | ${JSON.stringify({ workspaceRoot, error: error instanceof Error ? error.message : 'Unknown error' })}`, 'warn');
  }
}

export function writeWorkspaceManifestUpdate(
  workspaceRoot: string,
  request: ManifestWriteRequest
): { success: boolean; error?: string; manifestPath?: string; workspace?: ManifestWorkspacePrefs | null } {
  const root = workspaceRoot?.trim();
  if (!root) {
    return { success: false, error: 'workspaceRoot is required' };
  }
  if (request.model && !request.model.sourceRelativePath?.trim()) {
    return { success: false, error: 'sourceRelativePath is required when model is provided' };
  }
  if (request.model && !request.model.schema?.entityName) {
    return { success: false, error: 'schema.entityName is required when model is provided' };
  }

  const prev = readWorkspaceManifest(root);
  const manifest = applyManifestWrite(prev, request);
  backupOldManifestOnce(root);
  const out = writeManifestAtomic(root, manifest);
  if (!out.success) {
    log(`Workspace manifest write failed | ${JSON.stringify({ root, error: out.error })}`, 'warn');
  }
  return { ...out, workspace: manifest.workspace ?? null };
}

/**
 * Upsert one model snapshot into `.generator/manifest.json` under workspace root.
 */
export function recordWorkspaceManifestUpsert(
  workspaceRoot: string,
  schema: NormalizedModel,
  sourceRelativePath: string,
  event: 'save' | 'generate',
  workspace?: ManifestWorkspacePrefs
): { success: boolean; error?: string; manifestPath?: string } {
  return writeWorkspaceManifestUpdate(workspaceRoot, {
    event,
    model: { schema, sourceRelativePath },
    workspace
  });
}

/** Stash current model fields without updating save/generate timestamps. */
export function stashModelInManifest(
  workspaceRoot: string,
  schema: NormalizedModel,
  sourceRelativePath: string,
  workspace?: ManifestWorkspacePrefs
): { success: boolean; error?: string; manifestPath?: string } {
  return writeWorkspaceManifestUpdate(workspaceRoot, {
    event: 'stash',
    model: { schema, sourceRelativePath },
    workspace
  });
}

/** Persist workspace-level generate panel preferences. */
export function updateWorkspacePreferencesInManifest(
  workspaceRoot: string,
  workspace: ManifestWorkspacePrefs
): { success: boolean; error?: string; manifestPath?: string; workspace?: ManifestWorkspacePrefs | null } {
  return writeWorkspaceManifestUpdate(workspaceRoot, { event: 'workspace', workspace });
}

/**
 * Parse model file on disk and upsert manifest row (preserve UI config for existing fields).
 * Does not update lastSavedAt / lastGeneratedAt.
 */
export function reconcileModelFromDisk(
  workspaceRoot: string,
  absoluteFilePath: string,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null
): {
  success: boolean;
  error?: string;
  manifestPath?: string;
  schema?: NormalizedModel;
  sourceRelativePath?: string;
} {
  const root = resolveWorkspaceRootForModelFile(workspaceRoot, absoluteFilePath);

  const parseResult = parseNormalizedModel(absoluteFilePath, sourceType);
  if (!parseResult.success || !parseResult.model) {
    return { success: false, error: parseResult.error ?? 'Failed to parse model file' };
  }

  const rel = normalizeRelPath(toProjectRelativePath(root, absoluteFilePath));
  const merged = mergeModel(parseResult.model, findManifestModelByRelativePath(root, rel), sourceType);

  const out = writeWorkspaceManifestUpdate(root, {
    event: 'reconcile',
    model: { schema: merged, sourceRelativePath: rel }
  });
  if (out.success) {
    log(
      `Manifest reconciled after model disk change | ${JSON.stringify({
        manifestPath: out.manifestPath,
        entityName: merged.entityName,
        fieldCount: merged.fields.length,
        sourceRelativePath: rel
      })}`,
      'info'
    );
  }
  return { ...out, schema: merged, sourceRelativePath: rel };
}

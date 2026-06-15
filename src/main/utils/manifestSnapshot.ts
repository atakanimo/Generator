import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { parseModelFile, type SchemaDefinition } from '../ipc/schemaParser.js';
import { mergeSchema, sanitizeFieldRelationMeta, type MergedFieldConfig } from '../../shared/schemaMerge.js';
import { log } from './logger.js';
import { getGeneratorRoot } from './templateHelpers.js';

export const MANIFEST_VERSION = 2;
export const WORKSPACE_GENERATOR_DIR = '.generator';
export const MANIFEST_FILE_NAME = 'manifest.json';

export interface ManifestWorkspacePrefs {
  frontendPath?: string;
  generationMode?: 'frontend' | 'backend' | 'fullstack';
  isProtectedRoute?: boolean;
  isAdminUser?: boolean;
  updateExistingFrontendFiles?: boolean;
  updateExistingBackendFiles?: boolean;
  selectedFrontendFiles?: {
    service?: boolean;
    thunk?: boolean;
    slice?: boolean;
    page?: boolean;
  };
  selectedBackendFiles?: {
    model?: boolean;
    crud?: boolean;
    filters?: boolean;
    types?: boolean;
    service?: boolean;
    schema?: boolean;
    route?: boolean;
    serviceAdmin?: boolean;
    routeAdmin?: boolean;
  };
  features?: {
    deletable?: boolean;
    updatable?: boolean;
  };
}

export interface ManifestModelEntry {
  sourceRelativePath: string;
  entityName: string;
  fields: SchemaDefinition['fields'];
  nestedSchemas?: SchemaDefinition['nestedSchemas'];
}

export interface WorkspaceManifest {
  manifestVersion: number;
  lastSavedAt?: string;
  lastGeneratedAt?: string;
  generatorVersion?: string;
  workspace?: ManifestWorkspacePrefs;
  models: ManifestModelEntry[];
}

export type ManifestWriteEvent = 'save' | 'generate' | 'stash' | 'workspace' | 'reconcile';

export interface ManifestWriteRequest {
  model?: { schema: SchemaDefinition; sourceRelativePath: string };
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

function normalizeManifest(raw: WorkspaceManifest | null): WorkspaceManifest {
  const base: WorkspaceManifest = {
    manifestVersion: MANIFEST_VERSION,
    models: [],
    generatorVersion: readGeneratorVersion()
  };
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    manifestVersion: MANIFEST_VERSION,
    models: Array.isArray(raw.models) ? raw.models : [],
    workspace: raw.workspace && typeof raw.workspace === 'object' ? raw.workspace : undefined,
    lastSavedAt: raw.lastSavedAt,
    lastGeneratedAt: raw.lastGeneratedAt
  };
}

export function readWorkspaceManifest(workspaceRoot: string): WorkspaceManifest | null {
  const p = getWorkspaceManifestPath(workspaceRoot);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as WorkspaceManifest;
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

/** Match manifest row by `sourceRelativePath` (POSIX); returns null if workspace has no manifest or no row. */
export function findManifestModelByRelativePath(workspaceRoot: string, sourceRelativePath: string): ManifestModelEntry | null {
  const man = readWorkspaceManifest(workspaceRoot);
  if (!man?.models?.length) return null;
  const key = normalizeRelPath(sourceRelativePath);
  return man.models.find(m => normalizeRelPath(m.sourceRelativePath) === key) ?? null;
}

function upsertModels(models: ManifestModelEntry[], entry: ManifestModelEntry): ManifestModelEntry[] {
  const key = normalizeRelPath(entry.sourceRelativePath);
  const normalizedEntry: ManifestModelEntry = { ...entry, sourceRelativePath: key };
  const withoutStale = models.filter(m => {
    const mKey = normalizeRelPath(m.sourceRelativePath);
    if (mKey === key) return false;
    if (m.entityName === entry.entityName) return false;
    return true;
  });
  return [...withoutStale, normalizedEntry];
}

function mergeWorkspacePrefs(
  prev: ManifestWorkspacePrefs | undefined,
  next: ManifestWorkspacePrefs | undefined
): ManifestWorkspacePrefs | undefined {
  if (!next) return prev;
  if (!prev) return { ...next };
  return {
    ...prev,
    ...next,
    selectedFrontendFiles: next.selectedFrontendFiles
      ? { ...prev.selectedFrontendFiles, ...next.selectedFrontendFiles }
      : prev.selectedFrontendFiles,
    selectedBackendFiles: next.selectedBackendFiles
      ? { ...prev.selectedBackendFiles, ...next.selectedBackendFiles }
      : prev.selectedBackendFiles,
    features: next.features ? { ...prev.features, ...next.features } : prev.features
  };
}

export function applyManifestWrite(prev: WorkspaceManifest | null, request: ManifestWriteRequest): WorkspaceManifest {
  const manifest = normalizeManifest(prev);
  const now = new Date().toISOString();

  if (request.model) {
    const rel = normalizeRelPath(request.model.sourceRelativePath.trim());
    const entry: ManifestModelEntry = {
      sourceRelativePath: rel,
      entityName: request.model.schema.entityName,
      fields: request.model.schema.fields.map(f => sanitizeFieldRelationMeta(f as MergedFieldConfig)),
      nestedSchemas: request.model.schema.nestedSchemas?.map(ns => ({
        ...ns,
        fields: ns.fields.map(f => sanitizeFieldRelationMeta(f as MergedFieldConfig))
      }))
    };
    manifest.models = upsertModels(manifest.models, entry);
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
  schema: SchemaDefinition,
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
  schema: SchemaDefinition,
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
  schema?: SchemaDefinition;
  sourceRelativePath?: string;
} {
  const root = resolveWorkspaceRootForModelFile(workspaceRoot, absoluteFilePath);

  const parseResult = parseModelFile(absoluteFilePath, sourceType);
  if (!parseResult.success || !parseResult.schema) {
    return { success: false, error: parseResult.error ?? 'Failed to parse model file' };
  }

  const rel = normalizeRelPath(toProjectRelativePath(root, absoluteFilePath));
  const manifestRow = findManifestModelByRelativePath(root, rel);
  const savedSchema = manifestRow
    ? {
        entityName: manifestRow.entityName,
        fields: manifestRow.fields,
        nestedSchemas: manifestRow.nestedSchemas
      }
    : null;

  const merged = mergeSchema(parseResult.schema, savedSchema, sourceType) as SchemaDefinition;

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

/**
 * Renderer ↔ main IPC contract (`window.electronAPI`, exposed by `src/preload/index.ts`).
 * Models cross the boundary as NormalizedModel v2 (plan 5 §8: renderer on v2).
 */
import type { NormalizedApi, NormalizedModel } from './normalizedModel.js';
import type { ModelDraft } from './modelDraft.js';
import type { BackendDatabase, BackendIdType, BackendStack, HostDatabase } from './backendDatabase.js';
import type { AuthBootstrapOptions, WorkspaceAuth } from './authModules.js';
import type { ClientPlatform } from './clientPlatform.js';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | 'python-fastapi' | null;

export interface ScannedModel {
  fileName: string;
  path: string;
  /**
   * Python hosts (PY7): `generated` = manifest module (schema designer / editor); `importable` = hand-written
   * `modules/<m>/model.py` not imported yet (import dialog). Absent for the other stacks.
   */
  kind?: 'generated' | 'importable';
  entityName?: string;
}

export interface ScanResult {
  success: boolean;
  models: ScannedModel[];
  detectedType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | 'python-fastapi';
  detectedTechnologies?: string[];
  discoveryInfo?: string;
  error?: string;
}

/** API settings read from a module's files when the manifest has none (P5, R5); `new`: no module files (G3). */
export interface DetectedModuleApi {
  api: NormalizedApi;
  source: 'files' | 'new';
}

/** The model file the editor was opened from and its hash at that time (see `ParseModelResult.sourceHash`). */
export interface ModelSourceCheck {
  filePath: string;
  hash: string;
}

export interface ParseModelResult {
  success: boolean;
  /** Parsed model file merged with its stored settings (manifest row). */
  model?: NormalizedModel;
  hasSavedConfig?: boolean;
  /** Present when the stored settings have no normal operations yet. */
  detectedApi?: DetectedModuleApi;
  /** Hash of the model file as parsed; generation refuses to run when the file changed since (stale editor). */
  sourceHash?: string;
  error?: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  manifestPath?: string;
}

export interface ManifestWriteResult {
  success: boolean;
  error?: string;
  manifestPath?: string;
}

export interface BackendSelectedFiles {
  model?: boolean;
  crud?: boolean;
  filters?: boolean;
  types?: boolean;
  service?: boolean;
  serviceAdmin?: boolean;
  schema?: boolean;
  route?: boolean;
  routeAdmin?: boolean;
}

export interface ManifestWorkspacePrefs {
  /** Backend stack of the project (D5); detection is used when absent. */
  backendStack?: BackendStack;
  /** Written by the bootstrap together with `idType`, never changed (`backendDatabase.ts`). */
  database?: BackendDatabase;
  idType?: BackendIdType;
  frontendPath?: string;
  generationMode?: 'frontend' | 'backend' | 'fullstack';
  isProtectedRoute?: boolean;
  updateExistingBackendFiles?: boolean;
  selectedBackendFiles?: BackendSelectedFiles;
  features?: { deletable?: boolean; updatable?: boolean };
  /** Shared auth layer modules (docs/backend/auth.md); written by the bootstrap, absent on older hosts. */
  auth?: WorkspaceAuth;
  /**
   * İstemci uygulamalarının platformu, workspace köküne göre klasör (`apps/admin` → `admin`). Tespit (`package.json`)
   * ilk çözümde yazılır; elle değiştirilen değer tespitin önüne geçer (`clientPlatform.ts`).
   */
  clientPlatforms?: Record<string, ClientPlatform>;
}

export interface WorkspaceManifestReadResult {
  success: boolean;
  workspace?: ManifestWorkspacePrefs | null;
  error?: string;
}

export interface GenerateBackendResult {
  success: boolean;
  /** Hash of the model file after generation (the editor's new baseline; see `ParseModelResult.sourceHash`). */
  sourceHash?: string;
  files?: {
    model?: string;
    crud?: string;
    filters?: string;
    schema?: string;
    route?: string;
    service?: string;
    types?: string;
    routeAdmin?: string;
    serviceAdmin?: string;
    /** `<module>.hooks.ts`, only when this run created it. */
    hooks?: string;
  };
  /** .NET: project-relative files this run created or changed. */
  writtenFiles?: string[];
  /** Things to tell the user after a successful run (migration command, contract-closed operations). */
  notes?: string[];
  error?: string;
}

export interface GenerateFrontendResult {
  success: boolean;
  /** `@atakanimo/ata-admin-base` config (plan 6 §2); `extension` only when it was created by this run. */
  files?: { config: string; extension?: string; registry: string };
  warnings?: string[];
  errors?: string[];
}

export interface ParseBaseUrlResult {
  success: boolean;
  baseUrl?: string;
  error?: string;
}

export interface ModelWriteResult {
  success: boolean;
  filePath?: string;
  error?: string;
  /** Reconciled model after manifest sync. */
  schema?: NormalizedModel;
  sourceRelativePath?: string;
  manifestPath?: string;
  manifestUpdated?: boolean;
  /** Hash of the written model file (see `ParseModelResult.sourceHash`). */
  sourceHash?: string;
}

export type CreateModelResult = ModelWriteResult;
export type UpdateModelResult = ModelWriteResult;

export interface LoadModelDraftResult {
  success: boolean;
  draft?: ModelDraft;
  error?: string;
}

/** Field of a relation's target model, for the relation display / populate picker. */
export interface RelatedModelFieldInfo {
  name: string;
  /** Parser type token (`string`, `object`, …). */
  type: string;
  /** K3: the target lists this field with a `regex` filter, so admin autocomplete can search it. */
  regexSearchable?: boolean;
  objectFields?: Array<{
    name: string;
    type: string;
    required: boolean;
    trim?: boolean;
  }>;
}

export interface RelatedModelFieldsResult {
  success: boolean;
  fields?: RelatedModelFieldInfo[];
  modelPath?: string;
  error?: string;
}

/** One problem of the extra-field report (`src/main/parsers/python/mongoReport.ts`). */
export interface CollectionReportIssue {
  path: string;
  docs: number;
  types: string[];
  expected?: string;
  breaksAdminRead: boolean;
}

/** Read-only sample of the module's collection against the imported model (PY7). */
export interface CollectionReport {
  ok: boolean;
  reason?: 'no-config' | 'remote-skipped' | 'no-driver' | 'unreachable' | 'error';
  error?: string;
  source?: string;
  server?: string;
  database?: string;
  collection: string;
  exists?: boolean;
  total?: number;
  scanned?: number;
  sampled?: boolean;
  extra: CollectionReportIssue[];
  missing: CollectionReportIssue[];
  mismatched: CollectionReportIssue[];
  soft: CollectionReportIssue[];
}

/** `project:previewPythonImport`: parsed Pydantic class + extra-field report; nothing written. */
export interface PythonImportPreview {
  success: boolean;
  entityName?: string;
  collection?: string;
  className?: string;
  candidates?: string[];
  model?: NormalizedModel;
  warnings?: string[];
  suggestions?: string[];
  /** Fields that cannot be represented; the import is refused while any remain. */
  unsupported?: string[];
  report?: CollectionReport;
  reportSummary?: string;
  error?: string;
}

/** `project:importPythonModel`: manifest row + generate. */
export interface PythonImportResult {
  success: boolean;
  entityName?: string;
  /** The module's `model_generated.py` (schema designer / editor path from now on). */
  filePath?: string;
  sourceRelativePath?: string;
  writtenFiles?: string[];
  warnings?: string[];
  notes?: string[];
  error?: string;
}

/** New-host bootstrap (`project:bootstrapDotnet` / `bootstrapExpress` / `bootstrapPython` / `bootstrapAdmin`): created files, project-relative. */
export interface BootstrapProjectResult {
  success: boolean;
  /** Python: snake_case package (`src/<package>`); Express: npm package name. */
  package?: string;
  files?: string[];
  error?: string;
}

export interface ElectronAPI {
  dialog: {
    openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  };
  project: {
    scan: (path: string, type?: SourceType) => Promise<ScanResult>;
    parseModel: (filePath: string, projectRoot: string, sourceType?: SourceType) => Promise<ParseModelResult>;
    saveSchemaConfig: (
      projectRoot: string,
      schema: NormalizedModel,
      sourceRelativePath?: string,
      workspace?: ManifestWorkspacePrefs
    ) => Promise<SaveResult>;
    getWorkspaceManifest: (projectRoot: string) => Promise<WorkspaceManifestReadResult>;
    updateWorkspaceManifest: (projectRoot: string, workspace: ManifestWorkspacePrefs) => Promise<ManifestWriteResult>;
    stashModelManifest: (
      projectRoot: string,
      schema: NormalizedModel,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => Promise<ManifestWriteResult>;
    writeWorkspaceManifest: (
      projectRoot: string,
      schema: NormalizedModel,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => Promise<ManifestWriteResult>;
    generateBackend: (
      schema: NormalizedModel,
      projectPath: string,
      isProtectedRoute: boolean,
      sourceType?: SourceType,
      shouldAddRoute?: boolean,
      baseUrl?: string,
      updateExistingFiles?: boolean,
      isAdminUser?: boolean,
      selectedFiles?: BackendSelectedFiles,
      sourceCheck?: ModelSourceCheck
    ) => Promise<GenerateBackendResult>;
    generateFrontend: (
      schema: NormalizedModel,
      projectPath: string,
      backendPath?: string,
      features?: { deletable?: boolean; updatable?: boolean },
      baseUrl?: string
    ) => Promise<GenerateFrontendResult>;
    parseBaseUrl: (backendPath: string) => Promise<ParseBaseUrlResult>;
    createModel: (projectPath: string, sourceType: SourceType, draft: ModelDraft) => Promise<CreateModelResult>;
    loadModelDraft: (filePath: string, sourceType: SourceType) => Promise<LoadModelDraftResult>;
    getRelatedModelFields: (projectRoot: string, relationEntityName: string, sourceType?: SourceType) => Promise<RelatedModelFieldsResult>;
    updateModel: (filePath: string, sourceType: SourceType, draft: ModelDraft, projectPath?: string) => Promise<UpdateModelResult>;
    /** New .NET 10 + EF Core host (solution, 4 projects, core assets) in `root` for the chosen database / id type. */
    bootstrapDotnet: (root: string, app: string, db: HostDatabase, auth: AuthBootstrapOptions) => Promise<BootstrapProjectResult>;
    /** New Python + FastAPI host (pyproject, `src/<package>`, core assets) in `root`; `app` becomes a snake_case package (PY4). */
    bootstrapPython: (root: string, app: string, auth: AuthBootstrapOptions) => Promise<BootstrapProjectResult>;
    /** New Express + Mongoose + TypeScript host (skeleton + core assets) in `root`; `app` becomes a kebab-case npm name (PY9). */
    bootstrapExpress: (root: string, app: string, auth: AuthBootstrapOptions) => Promise<BootstrapProjectResult>;
    /** Auth modules + first admin last used on this machine (docs/backend/auth.md "İlk admin"). */
    getAuthDefaults: () => Promise<AuthBootstrapOptions>;
    /** New `@atakanimo/ata-admin-base` admin panel in `root`, wired to `stack`'s API prefix / dev port (`shared/adminPanel.ts`). */
    bootstrapAdmin: (root: string, app: string, stack: BackendStack) => Promise<BootstrapProjectResult>;
    /** PY7: parse a hand-written Pydantic module (`modules/<m>/model.py`) + extra-field report of its collection. */
    previewPythonImport: (
      projectPath: string,
      filePath: string,
      options?: { className?: string; report?: boolean; allowRemote?: boolean }
    ) => Promise<PythonImportPreview>;
    /** PY7: import the class (manifest row) and generate the module. */
    importPythonModel: (projectPath: string, filePath: string, options?: { className?: string }) => Promise<PythonImportResult>;
  };
  // Database connection commands (for future use)
  database: {
    connect: (config: unknown) => Promise<unknown>;
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    disconnect: () => Promise<void>;
  };
  [key: string]: unknown;
}

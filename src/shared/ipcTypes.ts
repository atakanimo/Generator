/**
 * Renderer ↔ main IPC contract (`window.electronAPI`, exposed by `src/preload/index.ts`).
 * Models cross the boundary as NormalizedModel v2 (plan 5 §8: renderer on v2).
 */
import type { NormalizedApi, NormalizedModel } from './normalizedModel.js';
import type { ModelDraft } from './modelDraft.js';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null;

export interface ScannedModel {
  fileName: string;
  path: string;
}

export interface ScanResult {
  success: boolean;
  models: ScannedModel[];
  detectedType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm';
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
  backendStack?: 'nodejs-mongoose' | 'dotnet-ef';
  frontendPath?: string;
  generationMode?: 'frontend' | 'backend' | 'fullstack';
  isProtectedRoute?: boolean;
  updateExistingBackendFiles?: boolean;
  selectedBackendFiles?: BackendSelectedFiles;
  features?: { deletable?: boolean; updatable?: boolean };
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
    /** New .NET 10 + EF Core host (solution, 4 projects, core assets) in `root`. */
    bootstrapDotnet: (root: string, app: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;
  };
  // Database connection commands (for future use)
  database: {
    connect: (config: unknown) => Promise<unknown>;
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    disconnect: () => Promise<void>;
  };
  [key: string]: unknown;
}

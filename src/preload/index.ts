import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface for type safety
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

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
}

export interface SchemaDefinition {
  entityName: string;
  fields: SchemaField[];
}

export interface ParseResult {
  success: boolean;
  schema?: SchemaDefinition;
  codeSchema?: SchemaDefinition;
  savedSchema?: SchemaDefinition | null;
  error?: string;
  hasSavedConfig?: boolean;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  filePath?: string;
  manifestPath?: string;
}

export interface ManifestWriteResult {
  success: boolean;
  error?: string;
  manifestPath?: string;
}

export interface ManifestWorkspacePrefs {
  frontendPath?: string;
  generationMode?: 'frontend' | 'backend' | 'fullstack';
  isProtectedRoute?: boolean;
  isAdminUser?: boolean;
  updateExistingFrontendFiles?: boolean;
  updateExistingBackendFiles?: boolean;
  selectedFrontendFiles?: { service?: boolean; thunk?: boolean; slice?: boolean; page?: boolean };
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
  features?: { deletable?: boolean; updatable?: boolean };
}

export interface WorkspaceManifestReadResult {
  success: boolean;
  workspace?: ManifestWorkspacePrefs | null;
  error?: string;
}

export interface GenerateCodeResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface GenerateBackendResult {
  success: boolean;
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
  };
  error?: string;
}

export interface GenerateFrontendResult {
  success: boolean;
  files?: {
    service?: string;
    serviceAdmin?: string;
    thunk?: string;
    slice?: string;
    page?: string;
    table?: string;
    modal?: string;
  };
  warnings?: string[];
  errors?: string[];
}

export interface ParseBaseUrlResult {
  success: boolean;
  baseUrl?: string;
  error?: string;
}

export interface ModelField {
  name: string;
  type: 'String' | 'Number' | 'Boolean' | 'Date' | 'ObjectId' | 'Array';
  required: boolean;
  unique: boolean;
  trim: boolean;
  displayText?: string;
  ref?: string; // Mongoose ref (e.g., "User", "Symbol") - used in schema definition
}

export interface ModelData {
  modelName: string;
  fields: ModelField[];
  hasInitializeFunction: boolean;
  initializeData?: Array<Record<string, string>>;
}

export interface CreateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
  /** Reconciled schema after manifest sync (when projectPath provided). */
  schema?: SchemaDefinition;
  sourceRelativePath?: string;
  manifestPath?: string;
  manifestUpdated?: boolean;
}

export interface UpdateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
  schema?: SchemaDefinition;
  sourceRelativePath?: string;
  manifestPath?: string;
  manifestUpdated?: boolean;
}

export interface ParseModelToModelDataResult {
  success: boolean;
  modelData?: ModelData;
  error?: string;
}

export interface RelatedModelFieldsResult {
  success: boolean;
  fields?: string[];
  modelPath?: string;
  error?: string;
}

export interface ElectronAPI {
  // Dialog commands
  dialog: {
    openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  };
  // Project scanning commands
  project: {
    scan: (path: string, type?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null) => Promise<ScanResult>;
    parseModel: (
      filePath: string,
      projectRoot: string,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null
    ) => Promise<ParseResult>;
    saveSchemaConfig: (
      projectRoot: string,
      schema: SchemaDefinition,
      sourceRelativePath?: string,
      workspace?: ManifestWorkspacePrefs
    ) => Promise<SaveResult>;
    getWorkspaceManifest: (projectRoot: string) => Promise<WorkspaceManifestReadResult>;
    updateWorkspaceManifest: (projectRoot: string, workspace: ManifestWorkspacePrefs) => Promise<ManifestWriteResult>;
    stashModelManifest: (
      projectRoot: string,
      schema: SchemaDefinition,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => Promise<ManifestWriteResult>;
    writeWorkspaceManifest: (
      projectRoot: string,
      schema: SchemaDefinition,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => Promise<ManifestWriteResult>;
    generateCode: (templateName: string, schema: SchemaDefinition, outputPath: string, outputFileName: string) => Promise<GenerateCodeResult>;
    generateBackend: (
      schema: SchemaDefinition,
      projectPath: string,
      isProtectedRoute: boolean,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      shouldAddRoute?: boolean,
      baseUrl?: string,
      updateExistingFiles?: boolean,
      isAdminUser?: boolean,
      selectedFiles?: {
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
    ) => Promise<GenerateBackendResult>;
    generateFrontend: (
      schema: SchemaDefinition,
      projectPath: string,
      selectedFiles?: { service?: boolean; thunk?: boolean; slice?: boolean; page?: boolean },
      backendPath?: string,
      features?: { deletable?: boolean; updatable?: boolean },
      baseUrl?: string,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      isProtectedRoute?: boolean,
      updateExistingFiles?: boolean,
      isAdminUser?: boolean
    ) => Promise<GenerateFrontendResult>;
    parseBaseUrl: (backendPath: string) => Promise<ParseBaseUrlResult>;
    createModel: (
      projectPath: string,
      sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      modelData: ModelData
    ) => Promise<CreateModelResult>;
    parseModelToModelData: (
      filePath: string,
      sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null
    ) => Promise<ParseModelToModelDataResult>;
    getRelatedModelFields: (
      projectRoot: string,
      relationEntityName: string,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null
    ) => Promise<RelatedModelFieldsResult>;
    updateModel: (
      filePath: string,
      sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      modelData: ModelData,
      projectPath?: string
    ) => Promise<UpdateModelResult>;
  };
  // Database connection commands (for future use)
  database: {
    connect: (config: unknown) => Promise<unknown>;
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    disconnect: () => Promise<void>;
  };
  // Add more IPC methods as needed
  [key: string]: unknown;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
  },
  project: {
    scan: (path: string, type?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null) => ipcRenderer.invoke('project:scan', { path, type }),
    parseModel: (filePath: string, projectRoot: string, sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null) =>
      ipcRenderer.invoke('project:parseModel', { filePath, projectRoot, sourceType }),
    saveSchemaConfig: (projectRoot: string, schema: SchemaDefinition, sourceRelativePath?: string, workspace?: ManifestWorkspacePrefs) =>
      ipcRenderer.invoke('project:saveSchemaConfig', { projectRoot, schema, sourceRelativePath, workspace }),
    getWorkspaceManifest: (projectRoot: string) => ipcRenderer.invoke('project:getWorkspaceManifest', { projectRoot }),
    updateWorkspaceManifest: (projectRoot: string, workspace: ManifestWorkspacePrefs) =>
      ipcRenderer.invoke('project:updateWorkspaceManifest', { projectRoot, workspace }),
    stashModelManifest: (
      projectRoot: string,
      schema: SchemaDefinition,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => ipcRenderer.invoke('project:stashModelManifest', { projectRoot, schema, sourceRelativePath, workspace }),
    writeWorkspaceManifest: (
      projectRoot: string,
      schema: SchemaDefinition,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => ipcRenderer.invoke('project:writeWorkspaceManifest', { projectRoot, schema, sourceRelativePath, workspace }),
    generateCode: (templateName: string, schema: SchemaDefinition, outputPath: string, outputFileName: string) =>
      ipcRenderer.invoke('project:generateCode', {
        templateName,
        schema,
        outputPath,
        outputFileName
      }),
    generateBackend: (
      schema: SchemaDefinition,
      projectPath: string,
      isProtectedRoute: boolean,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      shouldAddRoute?: boolean,
      baseUrl?: string,
      updateExistingFiles?: boolean,
      isAdminUser?: boolean,
      selectedFiles?: {
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
    ) =>
      ipcRenderer.invoke('project:generateBackend', {
        schema,
        projectPath,
        isProtectedRoute,
        sourceType,
        shouldAddRoute,
        baseUrl,
        updateExistingFiles,
        isAdminUser,
        selectedFiles
      }),
    generateFrontend: (
      schema: SchemaDefinition,
      projectPath: string,
      selectedFiles?: { service?: boolean; thunk?: boolean; slice?: boolean; page?: boolean },
      backendPath?: string,
      features?: { deletable?: boolean; updatable?: boolean },
      baseUrl?: string,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      isProtectedRoute?: boolean,
      updateExistingFiles?: boolean,
      isAdminUser?: boolean
    ) =>
      ipcRenderer.invoke('project:generateFrontend', {
        schema,
        projectPath,
        selectedFiles,
        backendPath,
        features,
        baseUrl,
        sourceType,
        isProtectedRoute,
        updateExistingFiles,
        isAdminUser
      }),
    parseBaseUrl: (backendPath: string) => ipcRenderer.invoke('project:parseBaseUrl', { backendPath }),
    createModel: (projectPath: string, sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null, modelData: ModelData) =>
      ipcRenderer.invoke('project:createModel', { projectPath, sourceType, modelData }),
    parseModelToModelData: (filePath: string, sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null) =>
      ipcRenderer.invoke('project:parseModelToModelData', { filePath, sourceType }),
    getRelatedModelFields: (
      projectRoot: string,
      relationEntityName: string,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null
    ) => ipcRenderer.invoke('project:getRelatedModelFields', { projectRoot, relationEntityName, sourceType }),
    updateModel: (
      filePath: string,
      sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      modelData: ModelData,
      projectPath?: string
    ) => ipcRenderer.invoke('project:updateModel', { filePath, sourceType, modelData, projectPath }),
  },
  database: {
    connect: (config: unknown) => ipcRenderer.invoke('database:connect', config),
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('database:query', sql, params),
    disconnect: () => ipcRenderer.invoke('database:disconnect')
  }
} as ElectronAPI);

// Type declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

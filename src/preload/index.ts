import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface for type safety
export interface ScannedModel {
  fileName: string;
  path: string;
}

export interface ScanResult {
  success: boolean;
  models: ScannedModel[];
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
}

export interface GenerateCodeResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface GenerateBackendResult {
  success: boolean;
  files?: {
    route?: string;
    service?: string;
    types?: string;
  };
  error?: string;
}

export interface GenerateFrontendResult {
  success: boolean;
  files?: {
    service?: string;
    thunk?: string;
    slice?: string;
    page?: string;
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
  initializeData?: Array<{ value: string }>;
}

export interface CreateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface ElectronAPI {
  // Dialog commands
  dialog: {
    openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  };
  // Project scanning commands
  project: {
    scan: (path: string, type: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm') => Promise<ScanResult>;
    parseModel: (filePath: string, projectRoot: string) => Promise<ParseResult>;
    saveSchemaConfig: (projectRoot: string, schema: SchemaDefinition) => Promise<SaveResult>;
    generateCode: (templateName: string, schema: SchemaDefinition, outputPath: string, outputFileName: string) => Promise<GenerateCodeResult>;
    generateBackend: (
      schema: SchemaDefinition,
      projectPath: string,
      isProtectedRoute: boolean,
      sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      shouldAddRoute?: boolean,
      baseUrl?: string,
      updateExistingFiles?: boolean,
      isSuperUser?: boolean
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
      isSuperUser?: boolean
    ) => Promise<GenerateFrontendResult>;
    parseBaseUrl: (backendPath: string) => Promise<ParseBaseUrlResult>;
    createModel: (
      projectPath: string,
      sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      modelData: ModelData
    ) => Promise<CreateModelResult>;
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
    scan: (path: string, type: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm') => ipcRenderer.invoke('project:scan', { path, type }),
    parseModel: (filePath: string, projectRoot: string, sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null) =>
      ipcRenderer.invoke('project:parseModel', { filePath, projectRoot, sourceType }),
    saveSchemaConfig: (projectRoot: string, schema: SchemaDefinition) => ipcRenderer.invoke('project:saveSchemaConfig', { projectRoot, schema }),
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
      isSuperUser?: boolean
    ) =>
      ipcRenderer.invoke('project:generateBackend', {
        schema,
        projectPath,
        isProtectedRoute,
        sourceType,
        shouldAddRoute,
        baseUrl,
        updateExistingFiles,
        isSuperUser
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
      isSuperUser?: boolean
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
        isSuperUser
      }),
    parseBaseUrl: (backendPath: string) => ipcRenderer.invoke('project:parseBaseUrl', { backendPath }),
    createModel: (
      projectPath: string,
      sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
      modelData: ModelData
    ) => ipcRenderer.invoke('project:createModel', { projectPath, sourceType, modelData })
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

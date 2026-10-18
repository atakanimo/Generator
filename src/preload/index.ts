import { contextBridge, ipcRenderer } from 'electron';

import type {
  BackendSelectedFiles,
  ModelSourceCheck,
  ElectronAPI,
  ManifestWorkspacePrefs,
  SourceType
} from '../shared/ipcTypes.js';
import type { NormalizedModel } from '../shared/normalizedModel.js';
import type { ModelDraft } from '../shared/modelDraft.js';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
  },
  project: {
    scan: (path: string, type?: SourceType) => ipcRenderer.invoke('project:scan', { path, type }),
    parseModel: (filePath: string, projectRoot: string, sourceType?: SourceType) =>
      ipcRenderer.invoke('project:parseModel', { filePath, projectRoot, sourceType }),
    saveSchemaConfig: (projectRoot: string, schema: NormalizedModel, sourceRelativePath?: string, workspace?: ManifestWorkspacePrefs) =>
      ipcRenderer.invoke('project:saveSchemaConfig', { projectRoot, schema, sourceRelativePath, workspace }),
    getWorkspaceManifest: (projectRoot: string) => ipcRenderer.invoke('project:getWorkspaceManifest', { projectRoot }),
    updateWorkspaceManifest: (projectRoot: string, workspace: ManifestWorkspacePrefs) =>
      ipcRenderer.invoke('project:updateWorkspaceManifest', { projectRoot, workspace }),
    stashModelManifest: (
      projectRoot: string,
      schema: NormalizedModel,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => ipcRenderer.invoke('project:stashModelManifest', { projectRoot, schema, sourceRelativePath, workspace }),
    writeWorkspaceManifest: (
      projectRoot: string,
      schema: NormalizedModel,
      sourceRelativePath: string,
      workspace?: ManifestWorkspacePrefs
    ) => ipcRenderer.invoke('project:writeWorkspaceManifest', { projectRoot, schema, sourceRelativePath, workspace }),
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
        selectedFiles,
        sourceCheck
      }),
    generateFrontend: (
      schema: NormalizedModel,
      projectPath: string,
      backendPath?: string,
      features?: { deletable?: boolean; updatable?: boolean },
      baseUrl?: string
    ) => ipcRenderer.invoke('project:generateFrontend', { schema, projectPath, backendPath, features, baseUrl }),
    parseBaseUrl: (backendPath: string) => ipcRenderer.invoke('project:parseBaseUrl', { backendPath }),
    createModel: (projectPath: string, sourceType: SourceType, draft: ModelDraft) =>
      ipcRenderer.invoke('project:createModel', { projectPath, sourceType, draft }),
    loadModelDraft: (filePath: string, sourceType: SourceType) =>
      ipcRenderer.invoke('project:loadModelDraft', { filePath, sourceType }),
    getRelatedModelFields: (
      projectRoot: string,
      relationEntityName: string,
      sourceType?: SourceType
    ) => ipcRenderer.invoke('project:getRelatedModelFields', { projectRoot, relationEntityName, sourceType }),
    updateModel: (
      filePath: string,
      sourceType: SourceType,
      draft: ModelDraft,
      projectPath?: string
    ) => ipcRenderer.invoke('project:updateModel', { filePath, sourceType, draft, projectPath }),
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

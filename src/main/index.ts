import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanProject } from './ipc/projectScanner.js';
import type { SourceType } from './ipc/projectScanner.js';
import type { NormalizedModel } from '../shared/normalizedModel.js';
import type { ManifestWorkspacePrefs } from '../shared/ipcTypes.js';
import type { BackendStack, HostDatabase } from '../shared/backendDatabase.js';
import { loadModelForEditor } from './ipc/modelEditor.js';
import { saveSchemaConfig } from './ipc/configManager.js';
import { readWorkspaceManifest, recordWorkspaceManifestUpsert, getWorkspacePreferences, stashModelInManifest, updateWorkspacePreferencesInManifest, reconcileModelFromDisk } from './utils/manifestSnapshot.js';
import { generateBackend } from './ipc/backendGenerator.js';
import { existsSync, readFileSync } from 'fs';
import { modelSourceHash, staleModelSourceError } from './utils/modelSourceHash.js';
import { generateFrontend } from './ipc/frontendGenerator.js';
import { parseBaseUrlFromBackend } from './utils/backendAppFile.js';
import { createModel, loadModelDraft, updateModel } from './ipc/modelCreator.js';
import { getRelatedModelFieldNames } from './ipc/relatedModelFields.js';
import { log } from './utils/logger.js';
import { bootstrapDotnetProject, generateDotnetBackend, loadDotnetModelDraft, writeDotnetModel } from './ipc/dotnetBackend.js';
import { bootstrapExpressProject } from './ipc/expressBackend.js';
import { readAuthDefaults, writeAuthDefaults } from './ipc/authDefaults.js';
import { lockAuthUsersModel, type AuthBootstrapOptions } from '../shared/authModules.js';
import { bootstrapAdminProject } from './ipc/adminPanel.js';
import {
  bootstrapPythonProject,
  generatePythonBackend,
  importPythonModel,
  isPythonProject,
  loadPythonModelDraft,
  previewPythonImport,
  writePythonModel
} from './ipc/pythonBackend.js';

/** Python host (plan backend-python-fastapi PY5, PY7): `sourceType` from the scan, or manifest `backendStack: 'python-fastapi'`. */
const isPythonSource = (sourceType: unknown, projectPath?: string) => sourceType === 'python-fastapi' || isPythonProject(projectPath);
/** Hash of the generated model file: the editor's baseline for the next generate (as for the other stacks). */
const withPythonSourceHash = <T extends { success: boolean; filePath?: string }>(result: T): T & { sourceHash?: string } =>
  result.success && result.filePath && existsSync(result.filePath)
    ? { ...result, sourceHash: modelSourceHash(readFileSync(result.filePath, 'utf8')) }
    : result;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/** A host with the shared auth layer keeps the auth fields of `Users` whatever the editor sends (docs/backend/auth.md). */
function withAuthLock<T extends { entityName: string }>(projectPath: string | undefined, model: T): T {
  if (!projectPath?.trim() || !model?.entityName) return model;
  const auth = readWorkspaceManifest(projectPath.trim())?.workspace?.auth;
  return auth ? (lockAuthUsersModel(model as never, auth.modules) as unknown as T) : model;
}

/** A successful bootstrap keeps its auth choices as the next dialog's defaults (this machine only). */
function rememberAuthDefaults<T extends { success: boolean }>(result: T, auth: AuthBootstrapOptions): T {
  if (result.success) writeAuthDefaults(auth);
  return result;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // Listen for preload errors
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    log(`Preload script error: ${preloadPath} - ${error}`, 'error');
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5190');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // IPC Handlers - Register after app is ready
  ipcMain.handle('dialog:openDirectory', async () => {
    try {
      return await dialog.showOpenDialog({ properties: ['openDirectory'] });
    } catch (error) {
      log(`Error opening directory dialog: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return { canceled: true, filePaths: [] };
    }
  });

  ipcMain.handle('project:scan', async (_, { path, type }) => {
    try {
      return await scanProject(path, type);
    } catch (error) {
      log(`Error scanning project: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        models: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:parseModel', async (_, { filePath, projectRoot, sourceType }) => {
    try {
      return loadModelForEditor(filePath, projectRoot, sourceType);
    } catch (error) {
      log(`Error parsing model file: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'project:getRelatedModelFields',
    async (_, { projectRoot, relationEntityName, sourceType }: { projectRoot: string; relationEntityName: string; sourceType?: unknown }) => {
      try {
        return await getRelatedModelFieldNames(projectRoot, relationEntityName, sourceType as SourceType | null | undefined);
      } catch (error) {
        log(`Error resolving related model fields: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('project:saveSchemaConfig', async (_, { projectRoot, schema, sourceRelativePath, workspace }) => {
    try {
      const result = saveSchemaConfig(projectRoot, schema, sourceRelativePath, workspace as ManifestWorkspacePrefs | undefined);
      return result;
    } catch (error) {
      log(`Error saving schema config: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:getWorkspaceManifest', async (_, { projectRoot }: { projectRoot?: string }) => {
    try {
      const root = projectRoot?.trim();
      if (!root) return { success: false, error: 'projectRoot is required' };
      const workspace = getWorkspacePreferences(root);
      return { success: true, workspace: workspace ?? null };
    } catch (error) {
      log(`Error reading workspace manifest: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle(
    'project:updateWorkspaceManifest',
    async (_, { projectRoot, workspace }: { projectRoot?: string; workspace?: ManifestWorkspacePrefs }) => {
      try {
        if (!projectRoot?.trim()) return { success: false, error: 'projectRoot is required' };
        if (!workspace || typeof workspace !== 'object') return { success: false, error: 'workspace is required' };
        return updateWorkspacePreferencesInManifest(projectRoot.trim(), workspace);
      } catch (error) {
        log(`Error updating workspace manifest: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );

  ipcMain.handle(
    'project:stashModelManifest',
    async (
      _,
      {
        projectRoot,
        schema,
        sourceRelativePath,
        workspace
      }: { projectRoot?: string; schema?: unknown; sourceRelativePath?: string; workspace?: ManifestWorkspacePrefs }
    ) => {
      try {
        if (!projectRoot?.trim() || !sourceRelativePath?.trim()) {
          return { success: false, error: 'projectRoot and sourceRelativePath are required' };
        }
        const sch = schema as NormalizedModel;
        if (!sch?.entityName) {
          return { success: false, error: 'schema.entityName is required' };
        }
        return stashModelInManifest(projectRoot.trim(), sch, sourceRelativePath.trim(), workspace);
      } catch (error) {
        log(`Error stashing model manifest: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
  );

  ipcMain.handle(
    'project:writeWorkspaceManifest',
    async (
      _,
      {
        projectRoot,
        schema,
        sourceRelativePath,
        workspace
      }: { projectRoot?: string; schema?: unknown; sourceRelativePath?: string; workspace?: ManifestWorkspacePrefs }
    ) => {
      try {
        if (!projectRoot?.trim() || !sourceRelativePath?.trim()) {
          return { success: false, error: 'projectRoot and sourceRelativePath are required' };
        }
        const sch = schema as NormalizedModel;
        if (!sch?.entityName) {
          return { success: false, error: 'schema.entityName is required' };
        }
        return recordWorkspaceManifestUpsert(
          projectRoot.trim(),
          sch,
          sourceRelativePath.trim(),
          'generate',
          workspace
        );
      } catch (error) {
        log(`Error writing workspace manifest: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    'project:generateBackend',
    async (_, { schema: rawSchema, projectPath, isProtectedRoute, sourceType, shouldAddRoute, baseUrl, updateExistingFiles, isAdminUser, selectedFiles, sourceCheck }) => {
      try {
        const schema = withAuthLock(projectPath, rawSchema);
        const stale = staleModelSourceError(sourceCheck);
        if (stale) return { success: false, error: stale };
        if (isPythonSource(sourceType, projectPath)) {
          const { filePath: _model, ...python } = withPythonSourceHash(generatePythonBackend(projectPath, schema));
          return python;
        }
        if (sourceType === 'dotnet-ef') {
          const { filePath: _entity, ...dotnet } = generateDotnetBackend(projectPath, schema);
          return dotnet.success && sourceCheck?.filePath && existsSync(sourceCheck.filePath)
            ? { ...dotnet, sourceHash: modelSourceHash(readFileSync(sourceCheck.filePath, 'utf8')) }
            : dotnet;
        }
        const generated = generateBackend(
          schema,
          projectPath,
          isProtectedRoute,
          sourceType,
          shouldAddRoute,
          baseUrl,
          updateExistingFiles,
          isAdminUser,
          selectedFiles
        );
        // Generation may rewrite the model file: hand its new hash back so the next generate is not refused.
        const result =
          generated.success && sourceCheck?.filePath && existsSync(sourceCheck.filePath)
            ? { ...generated, sourceHash: modelSourceHash(readFileSync(sourceCheck.filePath, 'utf8')) }
            : generated;
        return result;
      } catch (error) {
        log(`Error generating backend code: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('project:parseBaseUrl', async (_, { backendPath }) => {
    try {
      const baseUrl = parseBaseUrlFromBackend(backendPath);
      return { success: true, baseUrl };
    } catch (error) {
      return {
        success: false,
        baseUrl: '/api',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'project:generateFrontend',
    async (_, { schema, projectPath, backendPath, features, baseUrl }) => {
      try {
        return generateFrontend(schema, projectPath, backendPath, features, baseUrl);
      } catch (error) {
        log(`Error generating frontend code: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('project:createModel', async (_, { projectPath, sourceType, draft: rawDraft }) => {
    try {
      const draft = rawDraft?.model ? { ...rawDraft, model: withAuthLock(projectPath, rawDraft.model) } : rawDraft;
      // Python: the manifest is the model's source (K1); nothing to reconcile from the generated file.
      if (isPythonSource(sourceType, projectPath)) return withPythonSourceHash(writePythonModel(projectPath, draft));
      const result = sourceType === 'dotnet-ef' ? writeDotnetModel(projectPath, draft) : await createModel(projectPath, sourceType, draft);
      if (result.success && result.filePath) {
        const reconciled = reconcileModelFromDisk(projectPath?.trim(), result.filePath, sourceType);
        if (!reconciled.success) {
          log(`Manifest reconcile after createModel failed: ${reconciled.error}`, 'warn');
        }
        return {
          ...result,
          schema: reconciled.schema,
          sourceRelativePath: reconciled.sourceRelativePath,
          manifestPath: reconciled.manifestPath,
          manifestUpdated: reconciled.success,
          sourceHash: modelSourceHash(readFileSync(result.filePath, 'utf8'))
        };
      }
      return result;
    } catch (error) {
      log(`Error creating model: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:loadModelDraft', async (_, { filePath, sourceType }) => {
    try {
      if (sourceType === 'python-fastapi' || /[\\/]model_generated\.py$/.test(String(filePath ?? ''))) return loadPythonModelDraft(filePath);
      return sourceType === 'dotnet-ef' ? loadDotnetModelDraft(filePath) : loadModelDraft(filePath, sourceType);
    } catch (error) {
      log(`Error loading model draft: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:updateModel', async (_, { filePath, projectPath, sourceType, draft: rawDraft }) => {
    try {
      const draft = rawDraft?.model ? { ...rawDraft, model: withAuthLock(projectPath, rawDraft.model) } : rawDraft;
      if (isPythonSource(sourceType, projectPath)) return withPythonSourceHash(writePythonModel(projectPath, draft));
      const result = sourceType === 'dotnet-ef' ? writeDotnetModel(projectPath, draft) : await updateModel(filePath, sourceType, draft);
      if (result.success && result.filePath) {
        const reconciled = reconcileModelFromDisk(projectPath?.trim(), result.filePath, sourceType);
        if (!reconciled.success) {
          log(`Manifest reconcile after updateModel failed: ${reconciled.error}`, 'warn');
        }
        return {
          ...result,
          schema: reconciled.schema,
          sourceRelativePath: reconciled.sourceRelativePath,
          manifestPath: reconciled.manifestPath,
          manifestUpdated: reconciled.success,
          sourceHash: modelSourceHash(readFileSync(result.filePath, 'utf8'))
        };
      }
      return result;
    } catch (error) {
      log(`Error updating model: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'project:bootstrapDotnet',
    async (_, { root, app: appName, db, auth }: { root?: string; app?: string; db?: HostDatabase; auth?: AuthBootstrapOptions }) => {
      const target = root?.trim();
      if (!target || !appName?.trim()) return { success: false, error: 'Klasör ve uygulama adı gerekli.' };
      if (!db) return { success: false, error: 'Veritabanı ve id tipi gerekli.' };
      if (!auth) return { success: false, error: 'Auth ayarları (ilk admin) gerekli.' };
      return rememberAuthDefaults(await bootstrapDotnetProject(target, appName.trim(), db, auth), auth);
    }
  );

  ipcMain.handle('project:bootstrapExpress', async (_, { root, app: appName, auth }: { root?: string; app?: string; auth?: AuthBootstrapOptions }) => {
    const target = root?.trim();
    if (!target || !appName?.trim()) return { success: false, error: 'Klasör ve uygulama adı gerekli.' };
    if (!auth) return { success: false, error: 'Auth ayarları (ilk admin) gerekli.' };
    return rememberAuthDefaults(await bootstrapExpressProject(target, appName.trim(), auth), auth);
  });

  ipcMain.handle('project:getAuthDefaults', async () => readAuthDefaults());

  ipcMain.handle('project:bootstrapAdmin', async (_, { root, app: appName, stack }: { root?: string; app?: string; stack?: BackendStack }) => {
    const target = root?.trim();
    if (!target || !appName?.trim()) return { success: false, error: 'Klasör ve panel adı gerekli.' };
    if (!stack) return { success: false, error: 'Backend stack gerekli.' };
    return bootstrapAdminProject(target, appName.trim(), stack);
  });

  ipcMain.handle(
    'project:previewPythonImport',
    async (_, { projectPath, filePath, options }: { projectPath?: string; filePath?: string; options?: { className?: string; report?: boolean; allowRemote?: boolean } }) => {
      if (!projectPath?.trim() || !filePath?.trim()) return { success: false, error: 'projectPath and filePath are required' };
      return previewPythonImport(projectPath.trim(), filePath.trim(), options ?? {});
    }
  );

  ipcMain.handle(
    'project:importPythonModel',
    async (_, { projectPath, filePath, options }: { projectPath?: string; filePath?: string; options?: { className?: string } }) => {
      if (!projectPath?.trim() || !filePath?.trim()) return { success: false, error: 'projectPath and filePath are required' };
      return withPythonSourceHash(importPythonModel(projectPath.trim(), filePath.trim(), options ?? {}));
    }
  );

  ipcMain.handle('project:bootstrapPython', async (_, { root, app: appName, auth }: { root?: string; app?: string; auth?: AuthBootstrapOptions }) => {
    const target = root?.trim();
    if (!target || !appName?.trim()) return { success: false, error: 'Klasör ve uygulama adı gerekli.' };
    if (!auth) return { success: false, error: 'Auth ayarları (ilk admin) gerekli.' };
    return rememberAuthDefaults(await bootstrapPythonProject(target, appName.trim(), auth), auth);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanProject } from './ipc/projectScanner.js';
import type { SourceType } from './ipc/projectScanner.js';
import type { NormalizedModel } from '../shared/normalizedModel.js';
import type { ManifestWorkspacePrefs } from '../shared/ipcTypes.js';
import { loadModelForEditor } from './ipc/modelEditor.js';
import { saveSchemaConfig } from './ipc/configManager.js';
import { recordWorkspaceManifestUpsert, getWorkspacePreferences, stashModelInManifest, updateWorkspacePreferencesInManifest, reconcileModelFromDisk } from './utils/manifestSnapshot.js';
import { generateBackend } from './ipc/backendGenerator.js';
import { existsSync, readFileSync } from 'fs';
import { modelSourceHash, staleModelSourceError } from './utils/modelSourceHash.js';
import { generateFrontend } from './ipc/frontendGenerator.js';
import { parseBaseUrlFromBackend } from './utils/backendAppFile.js';
import { createModel, loadModelDraft, updateModel } from './ipc/modelCreator.js';
import { getRelatedModelFieldNames } from './ipc/relatedModelFields.js';
import { log } from './utils/logger.js';
import { bootstrapDotnetProject, generateDotnetBackend, loadDotnetModelDraft, writeDotnetModel } from './ipc/dotnetBackend.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
    async (_, { schema, projectPath, isProtectedRoute, sourceType, shouldAddRoute, baseUrl, updateExistingFiles, isAdminUser, selectedFiles, sourceCheck }) => {
      try {
        const stale = staleModelSourceError(sourceCheck);
        if (stale) return { success: false, error: stale };
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

  ipcMain.handle('project:createModel', async (_, { projectPath, sourceType, draft }) => {
    try {
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
      return sourceType === 'dotnet-ef' ? loadDotnetModelDraft(filePath) : loadModelDraft(filePath, sourceType);
    } catch (error) {
      log(`Error loading model draft: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:updateModel', async (_, { filePath, projectPath, sourceType, draft }) => {
    try {
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

  ipcMain.handle('project:bootstrapDotnet', async (_, { root, app: appName }: { root?: string; app?: string }) => {
    const target = root?.trim();
    if (!target || !appName?.trim()) return { success: false, error: 'Klasör ve uygulama adı gerekli.' };
    return bootstrapDotnetProject(target, appName.trim());
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

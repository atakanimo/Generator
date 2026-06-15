import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanProject } from './ipc/projectScanner.js';
import type { SourceType } from './ipc/projectScanner.js';
import { parseModelFile } from './ipc/schemaParser.js';
import type { SchemaDefinition } from './ipc/schemaParser.js';
import { loadSchemaConfig, saveSchemaConfig } from './ipc/configManager.js';
import { recordWorkspaceManifestUpsert, findManifestModelByRelativePath, toProjectRelativePath, getWorkspacePreferences, stashModelInManifest, updateWorkspacePreferencesInManifest, reconcileModelFromDisk } from './utils/manifestSnapshot.js';
import type { ManifestWorkspacePrefs } from './utils/manifestSnapshot.js';
import { generateCode } from './ipc/codeGenerator.js';
import { generateBackend } from './ipc/backendGenerator.js';
import { generateFrontend, parseBaseUrlFromBackend } from './ipc/frontendGenerator.js';
import { createModel, parseModelToModelData, updateModel } from './ipc/modelCreator.js';
import { getRelatedModelFieldNames } from './ipc/relatedModelFields.js';
import { log } from './utils/logger.js';

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
      // Step 1: Parse the actual file
      const parseResult = parseModelFile(filePath, sourceType);

      if (!parseResult.success || !parseResult.schema) {
        return parseResult;
      }

      const root = String(projectRoot || '').trim();
      const rel = root ? toProjectRelativePath(root, filePath) : '';
      const manifestRow = root && rel ? findManifestModelByRelativePath(root, rel) : null;

      let savedSchema: SchemaDefinition | null = null;
      if (manifestRow) {
        savedSchema = {
          entityName: manifestRow.entityName,
          fields: manifestRow.fields,
          nestedSchemas: manifestRow.nestedSchemas
        };
      } else {
        const savedConfig = loadSchemaConfig(projectRoot, parseResult.schema.entityName);
        savedSchema = savedConfig.success && savedConfig.schema ? savedConfig.schema : null;
      }

      return {
        success: true,
        codeSchema: parseResult.schema,
        savedSchema,
        hasSavedConfig: Boolean(savedSchema)
      };
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
        const sch = schema as SchemaDefinition;
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
        const sch = schema as SchemaDefinition;
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

  ipcMain.handle('project:generateCode', async (_, { templateName, schema, outputPath, outputFileName }) => {
    try {
      const result = generateCode(templateName, schema, outputPath, outputFileName);
      return result;
    } catch (error) {
      log(`Error generating code: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'project:generateBackend',
    async (_, { schema, projectPath, isProtectedRoute, sourceType, shouldAddRoute, baseUrl, updateExistingFiles, isAdminUser, selectedFiles }) => {
      try {
        const result = generateBackend(
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
    async (
      _,
      { schema, projectPath, selectedFiles, backendPath, features, baseUrl, sourceType, isProtectedRoute, updateExistingFiles, isAdminUser }
    ) => {
      try {
        const result = generateFrontend(
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
        );
        return result;
      } catch (error) {
        log(`Error generating frontend code: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('project:createModel', async (_, { projectPath, sourceType, modelData }) => {
    try {
      const result = await createModel(projectPath, sourceType, modelData);
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
          manifestUpdated: reconciled.success
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

  ipcMain.handle('project:parseModelToModelData', async (_, { filePath, sourceType }) => {
    try {
      const result = parseModelToModelData(filePath, sourceType);
      return result;
    } catch (error) {
      log(`Error parsing model to ModelData: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:updateModel', async (_, { filePath, projectPath, sourceType, modelData }) => {
    try {
      const result = await updateModel(filePath, sourceType, modelData);
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
          manifestUpdated: reconciled.success
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

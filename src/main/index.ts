import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanProject } from './ipc/projectScanner.js';
import { parseModelFile } from './ipc/schemaParser.js';
import { loadSchemaConfig, saveSchemaConfig } from './ipc/configManager.js';
import { generateCode } from './ipc/codeGenerator.js';
import { generateBackend } from './ipc/backendGenerator.js';
import { generateFrontend, parseBaseUrlFromBackend } from './ipc/frontendGenerator.js';
import { createModel, parseModelToModelData, updateModel } from './ipc/modelCreator.js';
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
    mainWindow.loadURL('http://localhost:5173');
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

      // Step 2: Try to load saved config
      const savedConfig = loadSchemaConfig(projectRoot, parseResult.schema.entityName);

      // Step 3: Return both code schema and saved config
      // The renderer will merge them using mergeSchema utility
      return {
        success: true,
        codeSchema: parseResult.schema,
        savedSchema: savedConfig.success ? savedConfig.schema : null,
        hasSavedConfig: savedConfig.success
      };
    } catch (error) {
      log(`Error parsing model file: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:saveSchemaConfig', async (_, { projectRoot, schema }) => {
    try {
      const result = saveSchemaConfig(projectRoot, schema);
      return result;
    } catch (error) {
      log(`Error saving schema config: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

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
    async (
      _,
      { schema, projectPath, isProtectedRoute, sourceType, shouldAddRoute, shouldGenerateResponseModel, baseUrl, updateExistingFiles, isSuperUser }
    ) => {
      try {
        const result = generateBackend(
          schema,
          projectPath,
          isProtectedRoute,
          sourceType,
          shouldAddRoute,
          shouldGenerateResponseModel,
          baseUrl,
          updateExistingFiles,
          isSuperUser
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
      { schema, projectPath, selectedFiles, backendPath, features, baseUrl, sourceType, isProtectedRoute, updateExistingFiles, isSuperUser }
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
          isSuperUser
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

  ipcMain.handle('project:updateModel', async (_, { filePath, sourceType, modelData }) => {
    try {
      const result = await updateModel(filePath, sourceType, modelData);
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

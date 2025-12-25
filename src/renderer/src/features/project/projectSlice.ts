import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { SchemaDefinition, FieldConfig } from '../../types/ProjectTypes';
import { ScanResult, ParseResult, GenerateCodeResult, GenerateBackendResult, GenerateFrontendResult } from '../../types/IPCInterfaces';
import { enrichFieldWithUIConfig, mergeSchema } from '../../utils/schemaUtils';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null;
export type ProjectStatus = 'idle' | 'scanning' | 'ready' | 'error';

export interface ScannedModel {
  fileName: string;
  path: string;
}

interface ProjectState {
  projectPath: string;
  frontendPath: string;
  sourceType: SourceType;
  modelsFound: ScannedModel[];
  status: ProjectStatus;
  error: string | null;
  selectedModelSchema: SchemaDefinition | null;
  parsingStatus: 'idle' | 'parsing' | 'success' | 'error';
  parsingError: string | null;
  savingStatus: 'idle' | 'saving' | 'success' | 'error';
  savingError: string | null;
  lastSavedFilePath: string | null;
  generatingStatus: 'idle' | 'generating' | 'success' | 'error';
  generatingError: string | null;
  lastGeneratedFilePath: string | null;
  generatingBackendStatus: 'idle' | 'generating' | 'success' | 'error';
  generatingBackendError: string | null;
  lastGeneratedBackendFiles: GenerateBackendResult['files'] | null;
  generatingFrontendStatus: 'idle' | 'generating' | 'success' | 'error';
  generatingFrontendError: string | null;
  lastGeneratedFrontendFiles: GenerateFrontendResult['files'] | null;
  creatingModelStatus: 'idle' | 'creating' | 'success' | 'error';
  creatingModelError: string | null;
  lastCreatedModelPath: string | null;
  updatingModelStatus: 'idle' | 'updating' | 'success' | 'error';
  updatingModelError: string | null;
  lastUpdatedModelPath: string | null;
}

const initialState: ProjectState = {
  projectPath: '/Users/atakanatabey/Projects/Varlik360/trading-bot-bot-backend/beckend-bot/src',
  frontendPath: '',
  sourceType: 'nodejs-mongoose',
  modelsFound: [],
  status: 'idle',
  error: null,
  selectedModelSchema: null,
  parsingStatus: 'idle',
  parsingError: null,
  savingStatus: 'idle',
  savingError: null,
  lastSavedFilePath: null,
  generatingStatus: 'idle',
  generatingError: null,
  lastGeneratedFilePath: null,
  generatingBackendStatus: 'idle',
  generatingBackendError: null,
  lastGeneratedBackendFiles: null,
  generatingFrontendStatus: 'idle',
  generatingFrontendError: null,
  lastGeneratedFrontendFiles: null,
  creatingModelStatus: 'idle',
  creatingModelError: null,
  lastCreatedModelPath: null,
  updatingModelStatus: 'idle',
  updatingModelError: null,
  lastUpdatedModelPath: null
};

// Async thunk for scanning project files
export const scanProjectFiles = createAsyncThunk(
  'project/scanProjectFiles',
  async ({ path, type }: { path: string; type: SourceType }, { rejectWithValue }) => {
    if (!type) {
      return rejectWithValue('Source type is required');
    }

    try {
      if (window.electronAPI?.project?.scan) {
        const result = await window.electronAPI.project.scan(path, type as 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm');
        if (result.success) {
          return result.models;
        } else {
          return rejectWithValue(result.error || 'Scan failed');
        }
      } else {
        return rejectWithValue('Project scan API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for parsing model files
export const parseModelFile = createAsyncThunk(
  'project/parseModelFile',
  async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }, { getState, rejectWithValue }) => {
    try {
      if (window.electronAPI?.project?.parseModel) {
        const state = getState() as { project: ProjectState };
        const sourceType = state.project.sourceType;
        const result = await window.electronAPI.project.parseModel(filePath, projectRoot, sourceType);
        if (result.success && result.codeSchema) {
          // Merge code schema with saved schema (if exists)
          const mergedSchema = mergeSchema(result.codeSchema, result.savedSchema || null);
          return mergedSchema;
        } else {
          return rejectWithValue(result.error || 'Parse failed');
        }
      } else {
        return rejectWithValue('Parse model API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for saving schema configuration
export const saveSchemaConfig = createAsyncThunk(
  'project/saveSchemaConfig',
  async ({ projectRoot, schema }: { projectRoot: string; schema: SchemaDefinition }, { rejectWithValue }) => {
    try {
      if (window.electronAPI?.project?.saveSchemaConfig) {
        const result = await window.electronAPI.project.saveSchemaConfig(projectRoot, schema);
        if (result.success) {
          return { success: true, filePath: result.filePath || null };
        } else {
          return rejectWithValue(result.error || 'Save failed');
        }
      } else {
        return rejectWithValue('Save schema config API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for generating code
export const generateCode = createAsyncThunk(
  'project/generateCode',
  async (
    {
      templateName,
      schema,
      outputPath,
      outputFileName
    }: {
      templateName: string;
      schema: SchemaDefinition;
      outputPath: string;
      outputFileName: string;
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.generateCode) {
        const result = await window.electronAPI.project.generateCode(templateName, schema, outputPath, outputFileName);
        if (result.success) {
          return { success: true, filePath: result.filePath || null };
        } else {
          return rejectWithValue(result.error || 'Code generation failed');
        }
      } else {
        return rejectWithValue('Generate code API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for generating backend code
export const generateBackend = createAsyncThunk(
  'project/generateBackend',
  async (
    {
      schema,
      projectPath,
      isProtectedRoute,
      sourceType,
      shouldAddRoute,
      shouldGenerateResponseModel,
      baseUrl,
      updateExistingFiles,
      isSuperUser
    }: {
      schema: SchemaDefinition;
      projectPath: string;
      isProtectedRoute: boolean;
      sourceType?: SourceType;
      shouldAddRoute?: boolean;
      shouldGenerateResponseModel?: boolean;
      baseUrl?: string;
      updateExistingFiles?: boolean;
      isSuperUser?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.generateBackend) {
        const result = await window.electronAPI.project.generateBackend(
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
        if (result.success) {
          return { success: true, files: result.files || null };
        } else {
          return rejectWithValue(result.error || 'Backend generation failed');
        }
      } else {
        return rejectWithValue('Generate backend API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for creating a new model
export const createModel = createAsyncThunk(
  'project/createModel',
  async (
    {
      projectPath,
      sourceType,
      modelData
    }: {
      projectPath: string;
      sourceType: SourceType;
      modelData: {
        modelName: string;
        fields: Array<{
          name: string;
          type: string;
          required: boolean;
          unique: boolean;
          trim: boolean;
        }>;
        hasInitializeFunction: boolean;
        initializeData?: Array<{ value: string }>;
      };
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.createModel) {
        const result = await window.electronAPI.project.createModel(projectPath, sourceType, modelData);
        if (result.success) {
          return { success: true, filePath: result.filePath || null };
        } else {
          return rejectWithValue(result.error || 'Model creation failed');
        }
      } else {
        return rejectWithValue('Create model API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for parsing model to ModelData
export const parseModelToModelData = createAsyncThunk(
  'project/parseModelToModelData',
  async (
    {
      filePath,
      sourceType
    }: {
      filePath: string;
      sourceType: SourceType;
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.parseModelToModelData) {
        const result = await window.electronAPI.project.parseModelToModelData(filePath, sourceType);
        if (result.success && result.modelData) {
          return result.modelData;
        } else {
          return rejectWithValue(result.error || 'Parse model failed');
        }
      } else {
        return rejectWithValue('Parse model to ModelData API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for updating a model
export const updateModel = createAsyncThunk(
  'project/updateModel',
  async (
    {
      filePath,
      sourceType,
      modelData
    }: {
      filePath: string;
      sourceType: SourceType;
      modelData: {
        modelName: string;
        fields: Array<{
          name: string;
          type: string;
          required: boolean;
          unique: boolean;
          trim: boolean;
        }>;
        hasInitializeFunction: boolean;
        initializeData?: Array<{ value: string }>;
      };
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.updateModel) {
        const result = await window.electronAPI.project.updateModel(filePath, sourceType, modelData);
        if (result.success) {
          return { success: true, filePath: result.filePath || null };
        } else {
          return rejectWithValue(result.error || 'Model update failed');
        }
      } else {
        return rejectWithValue('Update model API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for generating frontend code
export const generateFrontend = createAsyncThunk(
  'project/generateFrontend',
  async (
    {
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
    }: {
      schema: SchemaDefinition;
      projectPath: string;
      selectedFiles?: { service?: boolean; thunk?: boolean; slice?: boolean; page?: boolean };
      backendPath?: string;
      features?: { deletable?: boolean; updatable?: boolean };
      baseUrl?: string;
      sourceType?: SourceType;
      isProtectedRoute?: boolean;
      updateExistingFiles?: boolean;
      isSuperUser?: boolean;
    },
    { rejectWithValue, getState }
  ) => {
    try {
      const state = getState() as { project: ProjectState };
      const frontendPath = state.project.frontendPath || projectPath;
      const backendProjectPath = backendPath || state.project.projectPath;
      const frontendSourceType = sourceType || state.project.sourceType;

      if (window.electronAPI?.project?.generateFrontend) {
        const result = await window.electronAPI.project.generateFrontend(
          schema,
          frontendPath,
          selectedFiles,
          backendProjectPath,
          features,
          baseUrl,
          frontendSourceType,
          isProtectedRoute,
          updateExistingFiles,
          isSuperUser
        );
        if (result.success) {
          return { success: true, files: result.files || null };
        } else {
          return rejectWithValue(result.errors?.join(', ') || result.warnings?.join(', ') || 'Frontend generation failed');
        }
      } else {
        return rejectWithValue('Generate frontend API not available');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setProjectPath: (state, action: PayloadAction<string>) => {
      state.projectPath = action.payload;
      state.error = null;
    },
    setFrontendPath: (state, action: PayloadAction<string>) => {
      state.frontendPath = action.payload;
    },
    setSourceType: (state, action: PayloadAction<SourceType>) => {
      state.sourceType = action.payload;
      state.error = null;
    },
    setModelsFound: (state, action: PayloadAction<ScannedModel[]>) => {
      state.modelsFound = action.payload;
    },
    setStatus: (state, action: PayloadAction<ProjectStatus>) => {
      state.status = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.status = 'error';
    },
    startScanning: state => {
      state.status = 'scanning';
      state.modelsFound = [];
      state.error = null;
    },
    resetProject: state => {
      return initialState;
    },
    clearSelectedSchema: state => {
      state.selectedModelSchema = null;
      state.parsingStatus = 'idle';
      state.parsingError = null;
    },
    updateFieldConfig: (state, action: PayloadAction<{ fieldIndex: number; updates: Partial<FieldConfig> }>) => {
      if (state.selectedModelSchema) {
        const { fieldIndex, updates } = action.payload;
        if (state.selectedModelSchema.fields[fieldIndex]) {
          state.selectedModelSchema.fields[fieldIndex] = {
            ...state.selectedModelSchema.fields[fieldIndex],
            ...updates
          };
        }
      }
    }
  },
  extraReducers: builder => {
    builder
      .addCase(scanProjectFiles.pending, state => {
        state.status = 'scanning';
        state.modelsFound = [];
        state.error = null;
      })
      .addCase(scanProjectFiles.fulfilled, (state, action) => {
        state.status = 'ready';
        state.modelsFound = action.payload;
        state.error = null;
      })
      .addCase(scanProjectFiles.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload as string;
        state.modelsFound = [];
      })
      .addCase(parseModelFile.pending, state => {
        state.parsingStatus = 'parsing';
        state.parsingError = null;
        state.selectedModelSchema = null;
      })
      .addCase(parseModelFile.fulfilled, (state, action) => {
        state.parsingStatus = 'success';
        state.selectedModelSchema = action.payload;
        state.parsingError = null;
      })
      .addCase(parseModelFile.rejected, (state, action) => {
        state.parsingStatus = 'error';
        state.parsingError = action.payload as string;
        state.selectedModelSchema = null;
      })
      .addCase(saveSchemaConfig.pending, state => {
        state.savingStatus = 'saving';
        state.savingError = null;
      })
      .addCase(saveSchemaConfig.fulfilled, (state, action) => {
        state.savingStatus = 'success';
        state.savingError = null;
        state.lastSavedFilePath = action.payload.filePath || null;
      })
      .addCase(saveSchemaConfig.rejected, (state, action) => {
        state.savingStatus = 'error';
        state.savingError = action.payload as string;
      })
      .addCase(generateCode.pending, state => {
        state.generatingStatus = 'generating';
        state.generatingError = null;
      })
      .addCase(generateCode.fulfilled, (state, action) => {
        state.generatingStatus = 'success';
        state.generatingError = null;
        state.lastGeneratedFilePath = action.payload.filePath || null;
      })
      .addCase(generateCode.rejected, (state, action) => {
        state.generatingStatus = 'error';
        state.generatingError = action.payload as string;
      })
      .addCase(generateBackend.pending, state => {
        state.generatingBackendStatus = 'generating';
        state.generatingBackendError = null;
      })
      .addCase(generateBackend.fulfilled, (state, action) => {
        state.generatingBackendStatus = 'success';
        state.generatingBackendError = null;
        state.lastGeneratedBackendFiles = action.payload.files || null;
      })
      .addCase(generateBackend.rejected, (state, action) => {
        state.generatingBackendStatus = 'error';
        state.generatingBackendError = action.payload as string;
      })
      .addCase(generateFrontend.pending, state => {
        state.generatingFrontendStatus = 'generating';
        state.generatingFrontendError = null;
      })
      .addCase(generateFrontend.fulfilled, (state, action) => {
        state.generatingFrontendStatus = 'success';
        state.generatingFrontendError = null;
        state.lastGeneratedFrontendFiles = action.payload.files || null;
      })
      .addCase(generateFrontend.rejected, (state, action) => {
        state.generatingFrontendStatus = 'error';
        state.generatingFrontendError = action.payload as string;
      })
      .addCase(createModel.pending, state => {
        state.creatingModelStatus = 'creating';
        state.creatingModelError = null;
      })
      .addCase(createModel.fulfilled, (state, action) => {
        state.creatingModelStatus = 'success';
        state.creatingModelError = null;
        state.lastCreatedModelPath = action.payload.filePath || null;
      })
      .addCase(createModel.rejected, (state, action) => {
        state.creatingModelStatus = 'error';
        state.creatingModelError = action.payload as string;
      })
      .addCase(updateModel.pending, state => {
        state.updatingModelStatus = 'updating';
        state.updatingModelError = null;
      })
      .addCase(updateModel.fulfilled, (state, action) => {
        state.updatingModelStatus = 'success';
        state.updatingModelError = null;
        state.lastUpdatedModelPath = action.payload.filePath || null;
      })
      .addCase(updateModel.rejected, (state, action) => {
        state.updatingModelStatus = 'error';
        state.updatingModelError = action.payload as string;
      });
  }
});

export const {
  setProjectPath,
  setFrontendPath,
  setSourceType,
  setModelsFound,
  setStatus,
  setError,
  startScanning,
  resetProject,
  clearSelectedSchema,
  updateFieldConfig
} = projectSlice.actions;

export default projectSlice.reducer;

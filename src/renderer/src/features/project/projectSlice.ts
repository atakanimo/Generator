import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import type { AuthBootstrapOptions } from '@shared/authModules';
import type { NormalizedModel } from '@shared/normalizedModel';
import type {
  BackendSelectedFiles,
  BootstrapProjectResult,
  GenerateBackendResult,
  GenerateFrontendResult,
  PythonImportPreview,
  PythonImportResult,
  ScannedModel,
  SourceType
} from '@shared/ipcTypes';
import { adminDir } from '@shared/adminDir';
import { writeLastProjectPath } from './lastProjectPath';
import type { ModelDraft } from '@shared/modelDraft';
import type { NewProjectStack } from '@shared/backendStacks';
import type { HostDatabase } from '@shared/backendDatabase';
import { filePathToProjectRelativePath } from '../../utils/schemaUtils';
import { patchField, patchModelApi, type FieldPatch, type ModelApiSettings } from './modelEdits';
import {
  DEFAULT_WORKSPACE_GENERATE_PREFS,
  WorkspaceGeneratePrefs,
  buildManifestWorkspacePayload,
  hydrateWorkspaceFromManifest,
  mergeWorkspaceGeneratePrefs,
  ManifestWorkspacePayload
} from './workspacePrefs';

export type { ScannedModel, SourceType };
export type ProjectStatus = 'idle' | 'scanning' | 'ready' | 'error';

interface ProjectState {
  projectPath: string;
  frontendPath: string;
  sourceType: SourceType;
  detectedTechnologies: string[];
  discoveryInfo: string | null;
  modelsFound: ScannedModel[];
  status: ProjectStatus;
  error: string | null;
  selectedModelSchema: NormalizedModel | null;
  selectedModelSourceRelativePath: string | null;
  /** Hash of the model file when parsed; sent with generate so a file changed on disk is not overwritten. */
  selectedModelSourceHash: string | null;
  /** Where the selected model's API settings came from: manifest, existing module files, or G3 defaults (new). */
  selectedModelApiSource: 'saved' | 'files' | 'new' | null;
  parsingStatus: 'idle' | 'parsing' | 'success' | 'error';
  parsingError: string | null;
  savingStatus: 'idle' | 'saving' | 'success' | 'error';
  savingError: string | null;
  lastSavedFilePath: string | null;
  generatingBackendStatus: 'idle' | 'generating' | 'success' | 'error';
  generatingBackendError: string | null;
  lastGeneratedBackendFiles: GenerateBackendResult['files'] | null;
  /** Notes of the last backend generate (.NET: migration command, contract-closed operations). */
  lastGeneratedBackendNotes: string[];
  generatingFrontendStatus: 'idle' | 'generating' | 'success' | 'error';
  generatingFrontendError: string | null;
  lastGeneratedFrontendFiles: GenerateFrontendResult['files'] | null;
  creatingModelStatus: 'idle' | 'creating' | 'success' | 'error';
  creatingModelError: string | null;
  lastCreatedModelPath: string | null;
  updatingModelStatus: 'idle' | 'updating' | 'success' | 'error';
  updatingModelError: string | null;
  lastUpdatedModelPath: string | null;
  workspaceGeneratePrefs: WorkspaceGeneratePrefs;
  workspaceManifestLoaded: boolean;
  /** Python import dialog (PY7): hand-written `model.py` → preview (class, fields, extra-field report) → import. */
  pythonImport: {
    filePath: string | null;
    status: 'idle' | 'previewing' | 'ready' | 'importing' | 'imported' | 'error';
    preview: PythonImportPreview | null;
    result: PythonImportResult | null;
    error: string | null;
  };
}

const initialState: ProjectState = {
  projectPath: '',
  frontendPath: '',
  sourceType: null,
  detectedTechnologies: [],
  discoveryInfo: null,
  modelsFound: [],
  status: 'idle',
  error: null,
  selectedModelSchema: null,
  selectedModelSourceRelativePath: null,
  selectedModelSourceHash: null,
  selectedModelApiSource: null,
  parsingStatus: 'idle',
  parsingError: null,
  savingStatus: 'idle',
  savingError: null,
  lastSavedFilePath: null,
  generatingBackendStatus: 'idle',
  generatingBackendError: null,
  lastGeneratedBackendFiles: null,
  lastGeneratedBackendNotes: [],
  generatingFrontendStatus: 'idle',
  generatingFrontendError: null,
  lastGeneratedFrontendFiles: null,
  creatingModelStatus: 'idle',
  creatingModelError: null,
  lastCreatedModelPath: null,
  updatingModelStatus: 'idle',
  updatingModelError: null,
  lastUpdatedModelPath: null,
  workspaceGeneratePrefs: DEFAULT_WORKSPACE_GENERATE_PREFS,
  workspaceManifestLoaded: false,
  pythonImport: { filePath: null, status: 'idle', preview: null, result: null, error: null }
};

// Async thunk for scanning project files
export const scanProjectFiles = createAsyncThunk(
  'project/scanProjectFiles',
  async ({ path, type }: { path: string; type?: SourceType }, { rejectWithValue }) => {
    try {
      if (window.electronAPI?.project?.scan) {
        const result = await window.electronAPI.project.scan(path, type);
        if (result.success) {
          let workspace: ManifestWorkspacePayload | null = null;
          if (window.electronAPI.project.getWorkspaceManifest) {
            const man = await window.electronAPI.project.getWorkspaceManifest(path);
            if (man.success) workspace = man.workspace ?? null;
          }
          writeLastProjectPath(path);
          return {
            models: result.models,
            detectedType: result.detectedType || type || null,
            detectedTechnologies: result.detectedTechnologies || [],
            discoveryInfo: result.discoveryInfo || null,
            workspace
          };
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

function selectManifestWorkspacePayload(state: ProjectState) {
  return buildManifestWorkspacePayload(state.frontendPath, state.workspaceGeneratePrefs);
}

export const persistWorkspaceManifest = createAsyncThunk(
  'project/persistWorkspaceManifest',
  async (projectRoot: string | undefined, { getState, rejectWithValue }) => {
    const state = (getState() as { project: ProjectState }).project;
    const root = (projectRoot || state.projectPath)?.trim();
    if (!root || !window.electronAPI?.project?.updateWorkspaceManifest) {
      return rejectWithValue('Workspace manifest API not available');
    }
    try {
      const workspace = selectManifestWorkspacePayload(state);
      const result = await window.electronAPI.project.updateWorkspaceManifest(root, workspace);
      if (result.success) return { success: true };
      return rejectWithValue(result.error || 'Failed to persist workspace manifest');
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

export const stashActiveModelManifest = createAsyncThunk(
  'project/stashActiveModelManifest',
  async (_, { getState, rejectWithValue }) => {
    const state = (getState() as { project: ProjectState }).project;
    if (!state.projectPath || !state.selectedModelSchema || !state.selectedModelSourceRelativePath) {
      return { skipped: true as const };
    }
    if (!window.electronAPI?.project?.stashModelManifest) {
      return rejectWithValue('stashModelManifest API not available');
    }
    try {
      const workspace = selectManifestWorkspacePayload(state);
      const result = await window.electronAPI.project.stashModelManifest(
        state.projectPath,
        state.selectedModelSchema,
        state.selectedModelSourceRelativePath,
        workspace
      );
      if (result.success) return { success: true };
      return rejectWithValue(result.error || 'Stash failed');
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

// Async thunk for parsing model files
export const parseModelFile = createAsyncThunk(
  'project/parseModelFile',
  async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }, { getState, dispatch, rejectWithValue }) => {
    try {
      await dispatch(stashActiveModelManifest());
      await dispatch(persistWorkspaceManifest(projectRoot));

      if (window.electronAPI?.project?.parseModel) {
        const state = getState() as { project: ProjectState };
        const sourceType = state.project.sourceType;
        const result = await window.electronAPI.project.parseModel(filePath, projectRoot, sourceType);
        if (result.success && result.model) {
          const mergedSchema = result.model;
          const sourceRelativePath = filePathToProjectRelativePath(projectRoot, filePath);
          // P5: no stored API settings → take them from the module files (R5), or G3 defaults for a new model.
          const detected = result.detectedApi;
          const apiSource: ProjectState['selectedModelApiSource'] = detected ? detected.source : 'saved';
          if (detected) {
            mergedSchema.api = {
              ...detected.api,
              ...mergedSchema.api,
              normalOperations: detected.api.normalOperations ?? [],
              admin: mergedSchema.api?.admin ?? detected.api.admin ?? false
            };
          }
          return { schema: mergedSchema, sourceRelativePath, apiSource, sourceHash: result.sourceHash ?? null };
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
  async ({ projectRoot, schema }: { projectRoot: string; schema: NormalizedModel }, { getState, rejectWithValue }) => {
    try {
      if (window.electronAPI?.project?.saveSchemaConfig) {
        const state = getState() as { project: ProjectState };
        const rel = state.project.selectedModelSourceRelativePath;
        const workspace = selectManifestWorkspacePayload(state.project);
        const result = await window.electronAPI.project.saveSchemaConfig(projectRoot, schema, rel ?? undefined, workspace);
        if (result.success) {
          return { success: true, manifestPath: result.manifestPath || null };
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
      baseUrl,
      updateExistingFiles,
      isAdminUser,
      selectedFiles
    }: {
      schema: NormalizedModel;
      projectPath: string;
      isProtectedRoute: boolean;
      sourceType?: SourceType;
      shouldAddRoute?: boolean;
      baseUrl?: string;
      updateExistingFiles?: boolean;
      isAdminUser?: boolean;
      selectedFiles?: BackendSelectedFiles;
    },
    { getState, rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.generateBackend) {
        // The model file as the editor parsed it: generation refuses to overwrite a file changed on disk since.
        const { project } = getState() as { project: ProjectState };
        const rel = project.selectedModelSourceRelativePath;
        const sourceCheck =
          rel && project.selectedModelSourceHash ? { filePath: `${projectPath.replace(/\/+$/, '')}/${rel}`, hash: project.selectedModelSourceHash } : undefined;
        const result = await window.electronAPI.project.generateBackend(
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
        );
        if (result.success) {
          return { success: true, files: result.files || null, sourceHash: result.sourceHash ?? null, notes: result.notes ?? [] };
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
      draft
    }: {
      projectPath: string;
      sourceType: SourceType;
      draft: ModelDraft;
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.createModel) {
        const result = await window.electronAPI.project.createModel(projectPath, sourceType, draft);
        if (result.success) {
          return {
            success: true,
            filePath: result.filePath || null,
            schema: result.schema,
            sourceRelativePath: result.sourceRelativePath,
            sourceHash: result.sourceHash
          };
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

// Async thunk for loading a model file into the model editor
export const loadModelDraft = createAsyncThunk(
  'project/loadModelDraft',
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
      if (window.electronAPI?.project?.loadModelDraft) {
        const result = await window.electronAPI.project.loadModelDraft(filePath, sourceType);
        if (result.success && result.draft) {
          return result.draft;
        } else {
          return rejectWithValue(result.error || 'Parse model failed');
        }
      } else {
        return rejectWithValue('Load model draft API not available');
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
      projectPath,
      sourceType,
      draft
    }: {
      filePath: string;
      projectPath?: string;
      sourceType: SourceType;
      draft: ModelDraft;
    },
    { rejectWithValue }
  ) => {
    try {
      if (window.electronAPI?.project?.updateModel) {
        const result = await window.electronAPI.project.updateModel(filePath, sourceType, draft, projectPath);
        if (result.success) {
          return {
            success: true,
            filePath: result.filePath || null,
            schema: result.schema,
            sourceRelativePath: result.sourceRelativePath,
            sourceHash: result.sourceHash
          };
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

/** PY7: parse a hand-written Pydantic module + extra-field report (nothing written). */
export const previewPythonImport = createAsyncThunk(
  'project/previewPythonImport',
  async (
    { projectPath, filePath, className, allowRemote }: { projectPath: string; filePath: string; className?: string; allowRemote?: boolean },
    { rejectWithValue }
  ) => {
    if (!window.electronAPI?.project?.previewPythonImport) return rejectWithValue('Python import API not available');
    const result = await window.electronAPI.project.previewPythonImport(projectPath, filePath, { className, allowRemote });
    // A module without a class named like the entity still lists its classes: the dialog lets the user pick one.
    return result.success || result.candidates?.length ? result : rejectWithValue(result.error || 'Python modeli okunamadı');
  }
);

/** PY7: import the class into the manifest and generate the module. */
export const importPythonModel = createAsyncThunk(
  'project/importPythonModel',
  async ({ projectPath, filePath, className }: { projectPath: string; filePath: string; className?: string }, { rejectWithValue }) => {
    if (!window.electronAPI?.project?.importPythonModel) return rejectWithValue('Python import API not available');
    const result = await window.electronAPI.project.importPythonModel(projectPath, filePath, { className });
    return result.success ? result : rejectWithValue(result.error || 'İçe aktarma başarısız');
  }
);

/** Folder picker (Electron dialog): the chosen path, or `null` when cancelled / unavailable. */
export const pickDirectory = createAsyncThunk('project/pickDirectory', async (): Promise<string | null> => {
  const result = await window.electronAPI?.dialog?.openDirectory?.();
  return result && !result.canceled && result.filePaths?.length ? result.filePaths[0] : null;
});

/**
 * PY9: new host in an empty folder (.NET / Express / Python). Not listened to by the slice; always fulfils with the IPC
 * result so the dialog branches on `success` (no try / catch in components).
 */
export const bootstrapBackendProject = createAsyncThunk(
  'project/bootstrapBackendProject',
  async ({
    stack,
    root,
    app,
    db,
    auth
  }: {
    stack: NewProjectStack;
    root: string;
    app: string;
    db: HostDatabase;
    auth: AuthBootstrapOptions;
  }): Promise<BootstrapProjectResult> => {
    const api = window.electronAPI?.project;
    if (stack === 'dotnet-ef') {
      if (!api?.bootstrapDotnet) return { success: false, error: 'Project bootstrap API not available' };
      return api.bootstrapDotnet(root, app, db, auth);
    }
    const call = stack === 'nodejs-mongoose' ? api?.bootstrapExpress : api?.bootstrapPython;
    if (!call) return { success: false, error: 'Project bootstrap API not available' };
    return call(root, app, auth);
  }
);

/** Auth modules + first admin of the last bootstrap on this machine (`project:getAuthDefaults`); never rejects. */
export const loadAuthDefaults = createAsyncThunk('project/loadAuthDefaults', async (): Promise<AuthBootstrapOptions | null> => {
  const call = window.electronAPI?.project?.getAuthDefaults;
  return call ? call() : null;
});

/** New admin panel (`project:bootstrapAdmin`); same contract as `bootstrapBackendProject`. */
export const bootstrapAdminPanel = createAsyncThunk(
  'project/bootstrapAdminPanel',
  async ({ root, app, stack }: { root: string; app: string; stack: NewProjectStack }): Promise<BootstrapProjectResult> => {
    const call = window.electronAPI?.project?.bootstrapAdmin;
    if (!call) return { success: false, error: 'Admin bootstrap API not available' };
    return call(root, app, stack);
  }
);

// Async thunk for generating frontend code
export const generateFrontend = createAsyncThunk(
  'project/generateFrontend',
  async (
    {
      schema,
      projectPath,
      backendPath,
      features,
      baseUrl
    }: {
      schema: NormalizedModel;
      projectPath: string;
      backendPath?: string;
      features?: { deletable?: boolean; updatable?: boolean };
      baseUrl?: string;
    },
    { rejectWithValue, getState }
  ) => {
    try {
      const state = getState() as { project: ProjectState };
      const frontendPath = state.project.frontendPath || projectPath;
      const backendProjectPath = backendPath || state.project.projectPath;

      if (window.electronAPI?.project?.generateFrontend) {
        const result = await window.electronAPI.project.generateFrontend(
          schema,
          frontendPath,
          backendProjectPath,
          features,
          baseUrl
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
      const next = action.payload;
      if (next !== state.projectPath) {
        state.frontendPath = '';
        state.workspaceManifestLoaded = false;
      }
      state.projectPath = next;
      state.error = null;
    },
    setFrontendPath: (state, action: PayloadAction<string>) => {
      state.frontendPath = action.payload;
    },
    patchWorkspaceGeneratePrefs: (state, action: PayloadAction<Partial<WorkspaceGeneratePrefs>>) => {
      state.workspaceGeneratePrefs = mergeWorkspaceGeneratePrefs({
        ...state.workspaceGeneratePrefs,
        ...action.payload,
        selectedBackendFiles: action.payload.selectedBackendFiles
          ? { ...state.workspaceGeneratePrefs.selectedBackendFiles, ...action.payload.selectedBackendFiles }
          : state.workspaceGeneratePrefs.selectedBackendFiles,
        features: action.payload.features
          ? { ...state.workspaceGeneratePrefs.features, ...action.payload.features }
          : state.workspaceGeneratePrefs.features
      });
    },
    hydrateWorkspaceFromManifestAction: (
      state,
      action: PayloadAction<{ frontendPath?: string; prefs: Partial<WorkspaceGeneratePrefs> }>
    ) => {
      if (action.payload.frontendPath) {
        state.frontendPath = action.payload.frontendPath;
      }
      state.workspaceGeneratePrefs = mergeWorkspaceGeneratePrefs({
        ...state.workspaceGeneratePrefs,
        ...action.payload.prefs
      });
      state.workspaceManifestLoaded = true;
    },
    setSourceType: (state, action: PayloadAction<SourceType>) => {
      state.sourceType = action.payload;
      state.error = null;
    },
    setDetectedTechnologies: (state, action: PayloadAction<string[]>) => {
      state.detectedTechnologies = action.payload;
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
    resetProject: () => initialState,
    openPythonImport: (state, action: PayloadAction<string>) => {
      state.pythonImport = { filePath: action.payload, status: 'idle', preview: null, result: null, error: null };
    },
    closePythonImport: state => {
      state.pythonImport = initialState.pythonImport;
    },
    clearSelectedSchema: state => {
      state.selectedModelSchema = null;
      state.selectedModelSourceRelativePath = null;
      state.selectedModelSourceHash = null;
      state.parsingStatus = 'idle';
      state.parsingError = null;
    },
    markModelApiSaved: state => {
      if (state.selectedModelSchema) state.selectedModelApiSource = 'saved';
    },
    /** Model-level label (admin menu / page title); empty → default (humanized entity name). */
    updateModelLabel: (state, action: PayloadAction<string>) => {
      if (!state.selectedModelSchema) return;
      const label = action.payload;
      state.selectedModelSchema.ui = label.trim() ? { ...state.selectedModelSchema.ui, label } : undefined;
    },
    updateModelApi: (state, action: PayloadAction<ModelApiSettings>) => {
      if (!state.selectedModelSchema) return;
      state.selectedModelSchema = patchModelApi(state.selectedModelSchema, action.payload);
    },
    updateFieldConfig: (state, action: PayloadAction<{ fieldIndex: number; updates: FieldPatch }>) => {
      if (state.selectedModelSchema) {
        const { fieldIndex, updates } = action.payload;
        const field = state.selectedModelSchema.fields[fieldIndex];
        if (field) {
          state.selectedModelSchema.fields[fieldIndex] = patchField(field, updates);
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
        state.modelsFound = action.payload.models;
        state.sourceType = action.payload.detectedType;
        state.detectedTechnologies = action.payload.detectedTechnologies;
        state.discoveryInfo = action.payload.discoveryInfo;
        state.error = null;
        const hydrated = hydrateWorkspaceFromManifest(action.payload.workspace);
        state.frontendPath = adminDir(state.projectPath, hydrated.frontendPath);
        if (action.payload.workspace) {
          state.workspaceGeneratePrefs = mergeWorkspaceGeneratePrefs({
            ...state.workspaceGeneratePrefs,
            ...hydrated.prefs
          });
        }
        state.workspaceManifestLoaded = true;
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
        state.selectedModelSourceRelativePath = null;
        state.selectedModelSourceHash = null;
      state.selectedModelSourceHash = null;
      })
      .addCase(parseModelFile.fulfilled, (state, action) => {
        state.parsingStatus = 'success';
        state.selectedModelSchema = action.payload.schema;
        state.selectedModelSourceRelativePath = action.payload.sourceRelativePath;
        state.selectedModelSourceHash = action.payload.sourceHash;
        state.selectedModelApiSource = action.payload.apiSource;
        state.parsingError = null;
      })
      .addCase(parseModelFile.rejected, (state, action) => {
        state.parsingStatus = 'error';
        state.parsingError = action.payload as string;
        state.selectedModelSchema = null;
        state.selectedModelSourceRelativePath = null;
        state.selectedModelSourceHash = null;
      state.selectedModelSourceHash = null;
      })
      .addCase(saveSchemaConfig.pending, state => {
        state.savingStatus = 'saving';
        state.savingError = null;
      })
      .addCase(saveSchemaConfig.fulfilled, (state, action) => {
        state.selectedModelApiSource = 'saved';
        state.savingStatus = 'success';
        state.savingError = null;
        state.lastSavedFilePath = action.payload.manifestPath || null;
      })
      .addCase(saveSchemaConfig.rejected, (state, action) => {
        state.savingStatus = 'error';
        state.savingError = action.payload as string;
      })
      .addCase(generateBackend.pending, state => {
        state.generatingBackendStatus = 'generating';
        state.generatingBackendError = null;
      })
      .addCase(generateBackend.fulfilled, (state, action) => {
        state.generatingBackendStatus = 'success';
        state.generatingBackendError = null;
        state.lastGeneratedBackendFiles = action.payload.files || null;
        state.lastGeneratedBackendNotes = action.payload.notes || [];
        if (action.payload.sourceHash) state.selectedModelSourceHash = action.payload.sourceHash;
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
        if (
          action.payload.schema &&
          action.payload.sourceRelativePath &&
          state.selectedModelSourceRelativePath === action.payload.sourceRelativePath
        ) {
          state.selectedModelSchema = action.payload.schema;
          state.selectedModelSourceHash = action.payload.sourceHash ?? null;
        }
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
        if (
          action.payload.schema &&
          action.payload.sourceRelativePath &&
          state.selectedModelSourceRelativePath === action.payload.sourceRelativePath
        ) {
          state.selectedModelSchema = action.payload.schema;
          state.selectedModelSourceHash = action.payload.sourceHash ?? null;
        }
      })
      .addCase(updateModel.rejected, (state, action) => {
        state.updatingModelStatus = 'error';
        state.updatingModelError = action.payload as string;
      })
      .addCase(previewPythonImport.pending, state => {
        state.pythonImport.status = 'previewing';
        state.pythonImport.error = null;
      })
      .addCase(previewPythonImport.fulfilled, (state, action) => {
        state.pythonImport.status = 'ready';
        state.pythonImport.preview = action.payload;
        state.pythonImport.error = action.payload.success ? null : (action.payload.error ?? null);
      })
      .addCase(previewPythonImport.rejected, (state, action) => {
        state.pythonImport.status = 'error';
        state.pythonImport.preview = null;
        state.pythonImport.error = (action.payload as string) ?? action.error.message ?? 'Unknown error';
      })
      .addCase(importPythonModel.pending, state => {
        state.pythonImport.status = 'importing';
        state.pythonImport.error = null;
      })
      .addCase(importPythonModel.fulfilled, (state, action) => {
        state.pythonImport.status = 'imported';
        state.pythonImport.result = action.payload;
      })
      .addCase(importPythonModel.rejected, (state, action) => {
        state.pythonImport.status = 'ready';
        state.pythonImport.error = (action.payload as string) ?? action.error.message ?? 'Unknown error';
      });
  }
});

export const {
  setProjectPath,
  setFrontendPath,
  patchWorkspaceGeneratePrefs,
  hydrateWorkspaceFromManifestAction,
  setSourceType,
  setModelsFound,
  setStatus,
  setError,
  startScanning,
  resetProject,
  openPythonImport,
  closePythonImport,
  clearSelectedSchema,
  updateModelApi,
  updateModelLabel,
  markModelApiSaved,
  updateFieldConfig
} = projectSlice.actions;

export { buildManifestWorkspacePayload } from './workspacePrefs';

export default projectSlice.reducer;

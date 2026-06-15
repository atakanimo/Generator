/** Generate panel preferences persisted in `.generator/manifest.json` → `workspace`. */
export interface WorkspaceGeneratePrefs {
  generationMode: 'frontend' | 'backend' | 'fullstack';
  isProtectedRoute: boolean;
  isAdminUser: boolean;
  updateExistingFrontendFiles: boolean;
  updateExistingBackendFiles: boolean;
  selectedFrontendFiles: {
    service: boolean;
    thunk: boolean;
    slice: boolean;
    page: boolean;
  };
  selectedBackendFiles: {
    model: boolean;
    crud: boolean;
    filters: boolean;
    types: boolean;
    service: boolean;
    schema: boolean;
    route: boolean;
    serviceAdmin: boolean;
    routeAdmin: boolean;
  };
  features: {
    deletable: boolean;
    updatable: boolean;
  };
}

export const DEFAULT_WORKSPACE_GENERATE_PREFS: WorkspaceGeneratePrefs = {
  generationMode: 'frontend',
  isProtectedRoute: false,
  isAdminUser: false,
  updateExistingFrontendFiles: false,
  updateExistingBackendFiles: false,
  selectedFrontendFiles: {
    service: true,
    thunk: true,
    slice: true,
    page: true
  },
  selectedBackendFiles: {
    model: true,
    crud: true,
    filters: true,
    types: true,
    service: true,
    schema: true,
    route: true,
    serviceAdmin: true,
    routeAdmin: true
  },
  features: {
    deletable: true,
    updatable: true
  }
};

export interface ManifestWorkspacePayload {
  frontendPath?: string;
  generationMode?: WorkspaceGeneratePrefs['generationMode'];
  isProtectedRoute?: boolean;
  isAdminUser?: boolean;
  updateExistingFrontendFiles?: boolean;
  updateExistingBackendFiles?: boolean;
  selectedFrontendFiles?: Partial<WorkspaceGeneratePrefs['selectedFrontendFiles']>;
  selectedBackendFiles?: Partial<WorkspaceGeneratePrefs['selectedBackendFiles']>;
  features?: Partial<WorkspaceGeneratePrefs['features']>;
}

export function buildManifestWorkspacePayload(
  frontendPath: string,
  prefs: WorkspaceGeneratePrefs
): ManifestWorkspacePayload {
  return {
    frontendPath,
    generationMode: prefs.generationMode,
    isProtectedRoute: prefs.isProtectedRoute,
    isAdminUser: prefs.isAdminUser,
    updateExistingFrontendFiles: prefs.updateExistingFrontendFiles,
    updateExistingBackendFiles: prefs.updateExistingBackendFiles,
    selectedFrontendFiles: { ...prefs.selectedFrontendFiles },
    selectedBackendFiles: { ...prefs.selectedBackendFiles },
    features: { ...prefs.features }
  };
}

export function hydrateWorkspaceFromManifest(
  workspace: ManifestWorkspacePayload | null | undefined
): { frontendPath?: string; prefs: Partial<WorkspaceGeneratePrefs> } {
  if (!workspace) return { prefs: {} };
  const prefs: Partial<WorkspaceGeneratePrefs> = {};
  if (workspace.generationMode) prefs.generationMode = workspace.generationMode;
  if (workspace.isProtectedRoute !== undefined) prefs.isProtectedRoute = workspace.isProtectedRoute;
  if (workspace.isAdminUser !== undefined) prefs.isAdminUser = workspace.isAdminUser;
  if (workspace.updateExistingFrontendFiles !== undefined) {
    prefs.updateExistingFrontendFiles = workspace.updateExistingFrontendFiles;
  }
  if (workspace.updateExistingBackendFiles !== undefined) {
    prefs.updateExistingBackendFiles = workspace.updateExistingBackendFiles;
  }
  if (workspace.selectedFrontendFiles) {
    prefs.selectedFrontendFiles = {
      ...DEFAULT_WORKSPACE_GENERATE_PREFS.selectedFrontendFiles,
      ...workspace.selectedFrontendFiles
    };
  }
  if (workspace.selectedBackendFiles) {
    prefs.selectedBackendFiles = {
      ...DEFAULT_WORKSPACE_GENERATE_PREFS.selectedBackendFiles,
      ...workspace.selectedBackendFiles
    };
  }
  if (workspace.features) {
    prefs.features = {
      ...DEFAULT_WORKSPACE_GENERATE_PREFS.features,
      ...workspace.features
    };
  }
  return {
    frontendPath: workspace.frontendPath,
    prefs
  };
}

export function mergeWorkspaceGeneratePrefs(partial: Partial<WorkspaceGeneratePrefs>): WorkspaceGeneratePrefs {
  return {
    ...DEFAULT_WORKSPACE_GENERATE_PREFS,
    ...partial,
    selectedFrontendFiles: {
      ...DEFAULT_WORKSPACE_GENERATE_PREFS.selectedFrontendFiles,
      ...partial.selectedFrontendFiles
    },
    selectedBackendFiles: {
      ...DEFAULT_WORKSPACE_GENERATE_PREFS.selectedBackendFiles,
      ...partial.selectedBackendFiles
    },
    features: {
      ...DEFAULT_WORKSPACE_GENERATE_PREFS.features,
      ...partial.features
    }
  };
}

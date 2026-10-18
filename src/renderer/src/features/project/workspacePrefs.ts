/** Generate panel preferences persisted in `.generator/manifest.json` → `workspace`. */
export interface WorkspaceGeneratePrefs {
  generationMode: 'frontend' | 'backend' | 'fullstack';
  isProtectedRoute: boolean;
  updateExistingBackendFiles: boolean;
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
  updateExistingBackendFiles: false,
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
  updateExistingBackendFiles?: boolean;
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
    updateExistingBackendFiles: prefs.updateExistingBackendFiles,
    selectedBackendFiles: { ...prefs.selectedBackendFiles },
    features: { ...prefs.features }
  };
}

/** Keys removed in plan 6 §3 (`selectedFrontendFiles`, `updateExistingFrontendFiles`, `isAdminUser`) are ignored. */
export function hydrateWorkspaceFromManifest(
  workspace: ManifestWorkspacePayload | null | undefined
): { frontendPath?: string; prefs: Partial<WorkspaceGeneratePrefs> } {
  if (!workspace) return { prefs: {} };
  const prefs: Partial<WorkspaceGeneratePrefs> = {};
  if (workspace.generationMode) prefs.generationMode = workspace.generationMode;
  if (workspace.isProtectedRoute !== undefined) prefs.isProtectedRoute = workspace.isProtectedRoute;
  if (workspace.updateExistingBackendFiles !== undefined) {
    prefs.updateExistingBackendFiles = workspace.updateExistingBackendFiles;
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

/** Bundle entry for `scripts/verify/admin-bootstrap.mjs`: what the app calls for a new admin panel and its first modules. */
export { bootstrapAdminProject } from '../../src/main/ipc/adminPanel.ts';
export { toAdminPackageName } from '../../src/main/generators/admin-base/AdminHostBootstrap.ts';
export { ADMIN_BACKEND_DEFAULTS, ADMIN_PANEL_INFO } from '../../src/shared/adminPanel.ts';
export { stackTreePaths } from '../../src/shared/backendStacks.ts';
export { parseNormalizedModel } from '../../src/main/ipc/schemaParser.ts';
export { findManifestModelByRelativePath } from '../../src/main/utils/manifestSnapshot.ts';
export { mergeModel } from '../../src/shared/modelMerge.ts';
export { generateAdminConfig } from '../../src/main/generators/AdminConfigGenerator.ts';
export { generateClientModules } from '../../src/main/generators/client-redux/ClientGenerator.ts';
export { REDUX_WEB_PRESET } from '../../src/main/generators/client-redux/clientPreset.ts';

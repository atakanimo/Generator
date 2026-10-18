/** Bundle entry for `scripts/verify/migrate-module.mjs` (same calls as the Generator UI). */
export { parseNormalizedModel } from '../../src/main/ipc/schemaParser.ts';
export { findManifestModelByRelativePath, writeWorkspaceManifestUpdate } from '../../src/main/utils/manifestSnapshot.ts';
export { mergeModel } from '../../src/shared/modelMerge.ts';
export { generateBackend } from '../../src/main/ipc/backendGenerator.ts';
export { generateAdminConfig } from '../../src/main/generators/AdminConfigGenerator.ts';

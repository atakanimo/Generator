/** Bundle entry for `scripts/verify/admin-config-check.mjs`. */
export { parseNormalizedModel } from '../../src/main/ipc/schemaParser.ts';
export { findManifestModelByRelativePath } from '../../src/main/utils/manifestSnapshot.ts';
export { mergeModel } from '../../src/shared/modelMerge.ts';
export { generateAdminConfig, renderAdminConfigFile } from '../../src/main/generators/AdminConfigGenerator.ts';
export { findAdminMountPath } from '../../src/main/utils/backendAppFile.ts';
export { toAdminResourceConfig } from '../../src/main/generators/adminResourceConfig.ts';

/**
 * Bundle entry for `scripts/verify/regen-varlik360.mjs`: the same calls the app makes when generating a backend
 * module (`project:parseModel` = parse → manifest row → `mergeModel`, then `project:generateBackend`).
 */
export { parseNormalizedModel } from '../../src/main/ipc/schemaParser.ts';
export { findManifestModelByRelativePath } from '../../src/main/utils/manifestSnapshot.ts';
export { mergeModel } from '../../src/shared/modelMerge.ts';
export { canonicalModel } from '../../src/shared/normalizedModel.ts';
export { generateBackend } from '../../src/main/ipc/backendGenerator.ts';
// Model editor path (AddModelModal → "open model, save"): loadModelDraft → updateModel.
export { loadModelDraft, updateModel, createModel } from '../../src/main/ipc/modelCreator.ts';
// Manifest v3 gate.
export { readWorkspaceManifest, writeWorkspaceManifestUpdate, manifestBackupFileName } from '../../src/main/utils/manifestSnapshot.ts';
// P5 gate (`--p5`): per-model API settings, detection from files, model creation with enum / default.
export { detectModuleApi } from '../../src/main/utils/moduleApiDetect.ts';

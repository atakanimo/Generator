/**
 * `project:parseModel`: the schema designer's model — the parsed model file merged with its stored settings
 * (manifest row) as NormalizedModel v2.
 */
import { mergeModel, type SourceType } from '../../shared/modelMerge.js';
import type { NormalizedModel } from '../../shared/normalizedModel.js';
import type { ParseModelResult } from '../../shared/ipcTypes.js';
import { parseNormalizedModel } from './schemaParser.js';
import { findManifestModelByRelativePath, toProjectRelativePath } from '../utils/manifestSnapshot.js';
import { detectModuleApi } from '../utils/moduleApiDetect.js';
import { existsSync, readFileSync } from 'fs';
import { modelSourceHash } from '../utils/modelSourceHash.js';
import { loadPythonModelForEditor } from './pythonBackend.js';

export function loadModelForEditor(filePath: string, projectRoot: string, sourceType?: SourceType): ParseModelResult {
  // Python (K1): the manifest row is the model; the generated file only gives the stale-editor hash.
  if (sourceType === 'python-fastapi' || /[\\/]model_generated\.py$/.test(filePath)) {
    const py = loadPythonModelForEditor(filePath, projectRoot);
    if (!py.success || !py.model) return { success: false, error: py.error };
    return {
      success: true,
      model: py.model,
      hasSavedConfig: true,
      sourceHash: existsSync(filePath) ? modelSourceHash(readFileSync(filePath, 'utf8')) : undefined
    };
  }
  const parsed = parseNormalizedModel(filePath, sourceType);
  if (!parsed.success || !parsed.model) return { success: false, error: parsed.error };

  const root = String(projectRoot || '').trim();
  const rel = root ? toProjectRelativePath(root, filePath) : '';
  const saved: NormalizedModel | null = root && rel ? findManifestModelByRelativePath(root, rel) : null;

  // P5: no stored API settings yet → read them from the module's existing files (or G3 defaults).
  const detectedApi = root && saved?.api?.normalOperations === undefined ? detectModuleApi(root, parsed.model.entityName) : undefined;

  return {
    success: true,
    model: mergeModel(parsed.model, saved, sourceType),
    hasSavedConfig: Boolean(saved),
    detectedApi,
    sourceHash: modelSourceHash(readFileSync(filePath, 'utf8'))
  };
}

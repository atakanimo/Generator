import type { NormalizedModel } from '../../shared/normalizedModel.js';
import { recordWorkspaceManifestUpsert, type ManifestWorkspacePrefs } from '../utils/manifestSnapshot.js';

/**
 * Save a model's settings: the workspace manifest (`.generator/manifest.json`) is the only store.
 */
export function saveSchemaConfig(
  projectRoot: string,
  schema: NormalizedModel,
  sourceRelativePath?: string,
  workspace?: ManifestWorkspacePrefs
): { success: boolean; error?: string; manifestPath?: string } {
  const root = projectRoot?.trim();
  const rel = sourceRelativePath?.trim();
  if (!root || !rel) {
    return { success: false, error: 'Project root and model path are required to save model settings' };
  }
  try {
    const result = recordWorkspaceManifestUpsert(root, schema, rel, 'save', workspace);
    return result.success ? { success: true, manifestPath: result.manifestPath } : { success: false, error: result.error };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

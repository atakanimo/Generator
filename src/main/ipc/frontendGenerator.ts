/**
 * `project:generateFrontend`: the admin FE is `@atakanimo/ata-admin-base` config (plan 6 §2).
 */

import { generateAdminConfig } from '../generators/AdminConfigGenerator.js';
import { getProjectRootPath } from '../utils/templateHelpers.js';
import type { NormalizedModel } from '../../shared/normalizedModel.js';
import type { GenerateFrontendResult } from '../../shared/ipcTypes.js';
import { log } from '../utils/logger.js';

export type { GenerateFrontendResult };

/**
 * Admin FE generation: `@atakanimo/ata-admin-base` resource config for the model (plan 6 §2). Pages, tables and forms
 * are rendered by the package; nothing else is written.
 */
export function generateFrontend(
  model: NormalizedModel,
  projectPath: string,
  backendPath?: string,
  features?: { deletable?: boolean; updatable?: boolean },
  baseUrl?: string
): GenerateFrontendResult {
  log(`Admin config generation started for entity: ${model.entityName} → ${projectPath}`, 'info');
  const result = generateAdminConfig({
    model,
    frontendRoot: projectPath,
    backendRoot: backendPath ? getProjectRootPath(backendPath) : undefined,
    baseUrl,
    features
  });
  if (!result.success) log(`Admin config generation failed: ${result.error}`, 'error');
  return {
    success: result.success,
    files: result.files,
    warnings: [...(result.warnings ?? []), ...(result.skipped ?? []).map(s => `Field '${s.name}' not in the admin: ${s.reason}`)],
    errors: result.success ? [] : [result.error || 'Unknown error']
  };
}

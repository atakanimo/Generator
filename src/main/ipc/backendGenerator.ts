/**
 * Backend Generator (Refactored)
 * Wrapper for BackendGenerator class to maintain backward compatibility
 */

import { BackendGenerator, BackendGenerateOptions } from '../generators/express-mongoose/BackendGenerator.js';
import type { NormalizedModel } from '../../shared/normalizedModel.js';
import type { BackendSelectedFiles, GenerateBackendResult } from '../../shared/ipcTypes.js';
import { parseBaseUrlFromBackend } from '../utils/backendAppFile.js';
import { log } from '../utils/logger.js';
import { assertHostDatabase } from '../utils/manifestSnapshot.js';

function logInfo(message: string, context?: Record<string, unknown>): void {
  log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'info');
}

function logError(message: string, context?: Record<string, unknown>): void {
  log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'error');
}

export type { GenerateBackendResult };

/**
 * Generate backend code (routes, service, types) from templates
 * This function maintains backward compatibility with the old API
 */
export function generateBackend(
  schema: NormalizedModel,
  projectPath: string,
  isProtectedRoute: boolean,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
  shouldAddRoute?: boolean,
  baseUrl?: string,
  updateExistingFiles?: boolean,
  isAdminUser?: boolean,
  selectedFiles?: BackendSelectedFiles
): GenerateBackendResult {
  try {
    if (sourceType !== 'dotnet-ef' && sourceType !== 'nodejs-typeorm') assertHostDatabase(projectPath, 'nodejs-mongoose');
    // Parse base URL from backend if not provided
    const finalBaseUrl = baseUrl || parseBaseUrlFromBackend(projectPath);
    logInfo('Using base URL for backend generation', { baseUrl: finalBaseUrl, projectPath });

    // Create options object
    const options: BackendGenerateOptions = {
      schema,
      projectPath,
      sourceType,
      isProtectedRoute,
      shouldAddRoute: shouldAddRoute ?? true,
      baseUrl: finalBaseUrl,
      updateExistingFiles: updateExistingFiles ?? false,
      isAdminUser: isAdminUser ?? false,
      selectedFiles
    };

    // Create generator instance and generate
    const generator = new BackendGenerator(options);
    return generator.generate();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError('Backend generation failed', { error: errorMessage, projectPath, entityName: schema?.entityName });

    return {
      success: false,
      error: errorMessage
    };
  }
}

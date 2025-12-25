/**
 * Backend Generator (Refactored)
 * Wrapper for BackendGenerator class to maintain backward compatibility
 */

import { BackendGenerator, BackendGenerateOptions } from '../generators/BackendGenerator.js';
import { SchemaDefinition } from './schemaParser.js';
import { parseBaseUrlFromBackend } from './frontendGenerator.js';
import { log } from '../utils/logger.js';

export interface GenerateBackendResult {
  success: boolean;
  files?: { route?: string; service?: string; types?: string };
  error?: string;
}

/**
 * Generate backend code (routes, service, types) from templates
 * This function maintains backward compatibility with the old API
 */
export function generateBackend(
  schema: SchemaDefinition,
  projectPath: string,
  isProtectedRoute: boolean,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
  shouldAddRoute?: boolean,
  shouldGenerateResponseModel?: boolean,
  baseUrl?: string,
  updateExistingFiles?: boolean,
  isSuperUser?: boolean
): GenerateBackendResult {
  try {
    // Parse base URL from backend if not provided
    const finalBaseUrl = baseUrl || parseBaseUrlFromBackend(projectPath);
    log(`Using base URL: ${finalBaseUrl}`, 'info');

    // Create options object
    const options: BackendGenerateOptions = {
      schema,
      projectPath,
      sourceType,
      isProtectedRoute,
      shouldAddRoute: shouldAddRoute ?? true,
      shouldGenerateResponseModel: shouldGenerateResponseModel ?? false,
      baseUrl: finalBaseUrl,
      updateExistingFiles: updateExistingFiles ?? false,
      isSuperUser: isSuperUser ?? false
    };

    // Create generator instance and generate
    const generator = new BackendGenerator(options);
    return generator.generate();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Backend generation failed: ${errorMessage}`, 'error');
    
    return {
      success: false,
      error: errorMessage
    };
  }
}


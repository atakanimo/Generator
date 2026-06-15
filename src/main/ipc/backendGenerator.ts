/**
 * Backend Generator (Refactored)
 * Wrapper for BackendGenerator class to maintain backward compatibility
 */

import { BackendGenerator, BackendGenerateOptions } from '../generators/BackendGenerator.js';
import { SchemaDefinition } from './schemaParser.js';
import { parseBaseUrlFromBackend } from './frontendGenerator.js';
import { log } from '../utils/logger.js';

function logInfo(message: string, context?: Record<string, unknown>): void {
  log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'info');
}

function logError(message: string, context?: Record<string, unknown>): void {
  log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'error');
}

export interface GenerateBackendResult {
  success: boolean;
  files?: {
    model?: string;
    crud?: string;
    filters?: string;
    types?: string;
    service?: string;
    serviceAdmin?: string;
    schema?: string;
    route?: string;
    routeAdmin?: string;
  };
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
  baseUrl?: string,
  updateExistingFiles?: boolean,
  isAdminUser?: boolean,
  selectedFiles?: {
    model?: boolean;
    crud?: boolean;
    filters?: boolean;
    types?: boolean;
    service?: boolean;
    serviceAdmin?: boolean;
    schema?: boolean;
    route?: boolean;
    routeAdmin?: boolean;
  }
): GenerateBackendResult {
  try {
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

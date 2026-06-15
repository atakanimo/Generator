/**
 * Frontend Generator (Refactored)
 * Wrapper for FrontendGenerator class to maintain backward compatibility
 */

import { FrontendGenerator, FrontendGenerateOptions, parseBaseUrlFromBackend } from '../generators/FrontendGenerator.js';
import { SchemaDefinition } from './schemaParser.js';
import { log } from '../utils/logger.js';

export { parseBaseUrlFromBackend };

export interface GenerateFrontendResult {
  success: boolean;
  files?: {
    service?: string;
    serviceAdmin?: string;
    thunk?: string;
    slice?: string;
    page?: string;
    table?: string;
    modal?: string;
  };
  warnings?: string[];
  errors?: string[];
}

/**
 * Generate frontend code (service, thunk, slice, page) from templates
 * This function maintains backward compatibility with the old API
 */
export function generateFrontend(
  schema: SchemaDefinition,
  projectPath: string,
  selectedFiles?: { service?: boolean; thunk?: boolean; slice?: boolean; page?: boolean },
  backendPath?: string,
  features?: { deletable?: boolean; updatable?: boolean },
  baseUrl?: string,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
  isProtectedRoute?: boolean,
  updateExistingFiles?: boolean,
  isAdminUser?: boolean
): GenerateFrontendResult {
  try {
    log(`Frontend generation started for entity: ${schema.entityName}`, 'info');
    log(`Project path: ${projectPath}`, 'info');
    
    // Parse base URL from backend if not provided and backendPath exists
    let finalBaseUrl = baseUrl;
    if (!finalBaseUrl && backendPath) {
      finalBaseUrl = parseBaseUrlFromBackend(backendPath);
      log(`Parsed base URL from backend: ${finalBaseUrl}`, 'info');
    } else if (!finalBaseUrl) {
      finalBaseUrl = '/api';
      log(`Using default base URL: ${finalBaseUrl}`, 'info');
    }

    // Create options object
    const options: FrontendGenerateOptions = {
      schema,
      projectPath,
      sourceType,
      selectedFiles: selectedFiles || { service: true, thunk: true, slice: true, page: true },
      backendPath,
      features: features || { deletable: true, updatable: true },
      baseUrl: finalBaseUrl,
      isProtectedRoute: isProtectedRoute ?? false,
      updateExistingFiles: updateExistingFiles ?? false,
      isAdminUser: isAdminUser ?? false
    };

    // Create generator instance and generate
    const generator = new FrontendGenerator(options);
    const result = generator.generate();

    return {
      ...result,
      warnings: [],
      errors: result.success ? [] : [result.error || 'Unknown error']
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Frontend generation failed: ${errorMessage}`, 'error');
    
    return {
      success: false,
      errors: [errorMessage],
      warnings: []
    };
  }
}


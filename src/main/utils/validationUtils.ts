/**
 * Validation Utility
 * Centralized validation functions for paths, schemas, and data
 */

import { existsSync, statSync } from 'fs';
import { resolve, normalize, isAbsolute } from 'path';
import { log } from './logger.js';

export type SourceType = 'nodejs-mongoose' | 'nodejs-typeorm' | 'dotnet-ef';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate if a path exists and is a directory
 */
export function validateDirectory(dirPath: string): ValidationResult {
  try {
    if (!dirPath || dirPath.trim() === '') {
      return {
        valid: false,
        error: 'Directory path cannot be empty'
      };
    }

    if (!existsSync(dirPath)) {
      return {
        valid: false,
        error: `Directory does not exist: ${dirPath}`
      };
    }

    const stats = statSync(dirPath);
    if (!stats.isDirectory()) {
      return {
        valid: false,
        error: `Path is not a directory: ${dirPath}`
      };
    }

    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      valid: false,
      error: `Invalid directory: ${errorMessage}`
    };
  }
}

/**
 * Validate if a path exists and is a file
 */
export function validateFile(filePath: string): ValidationResult {
  try {
    if (!filePath || filePath.trim() === '') {
      return {
        valid: false,
        error: 'File path cannot be empty'
      };
    }

    if (!existsSync(filePath)) {
      return {
        valid: false,
        error: `File does not exist: ${filePath}`
      };
    }

    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return {
        valid: false,
        error: `Path is not a file: ${filePath}`
      };
    }

    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      valid: false,
      error: `Invalid file: ${errorMessage}`
    };
  }
}

/**
 * Sanitize and normalize a path
 */
export function sanitizePath(inputPath: string): string {
  try {
    // Normalize path (resolve . and ..)
    let path = normalize(inputPath);

    // Convert to absolute if relative
    if (!isAbsolute(path)) {
      path = resolve(path);
    }

    return path;
  } catch (error) {
    log(`Path sanitization failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return inputPath;
  }
}

/**
 * Validate path for security (prevent path traversal attacks)
 */
export function validatePathSecurity(
  inputPath: string,
  allowedBasePath?: string
): ValidationResult {
  try {
    const sanitized = sanitizePath(inputPath);

    // Check for suspicious patterns
    if (sanitized.includes('..')) {
      return {
        valid: false,
        error: 'Path traversal detected'
      };
    }

    // If base path provided, ensure input is within it
    if (allowedBasePath) {
      const sanitizedBase = sanitizePath(allowedBasePath);
      if (!sanitized.startsWith(sanitizedBase)) {
        return {
          valid: false,
          error: 'Path is outside allowed directory'
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Path security validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validate source type
 */
export function validateSourceType(sourceType: any): sourceType is SourceType {
  const validTypes: SourceType[] = ['nodejs-mongoose', 'nodejs-typeorm', 'dotnet-ef'];
  return validTypes.includes(sourceType);
}

/**
 * Validate entity name
 */
export function validateEntityName(entityName: string): ValidationResult {
  if (!entityName || entityName.trim() === '') {
    return {
      valid: false,
      error: 'Entity name cannot be empty'
    };
  }

  // Check if starts with uppercase letter
  if (!/^[A-Z]/.test(entityName)) {
    return {
      valid: false,
      error: 'Entity name must start with an uppercase letter'
    };
  }

  // Check if contains only alphanumeric characters
  if (!/^[A-Za-z0-9_]+$/.test(entityName)) {
    return {
      valid: false,
      error: 'Entity name can only contain letters, numbers, and underscores'
    };
  }

  return { valid: true };
}

/**
 * Validate field name
 */
export function validateFieldName(fieldName: string): ValidationResult {
  if (!fieldName || fieldName.trim() === '') {
    return {
      valid: false,
      error: 'Field name cannot be empty'
    };
  }

  // Check if starts with lowercase letter or underscore
  if (!/^[a-z_]/.test(fieldName)) {
    return {
      valid: false,
      error: 'Field name must start with a lowercase letter or underscore'
    };
  }

  // Check if contains only alphanumeric characters and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(fieldName)) {
    return {
      valid: false,
      error: 'Field name can only contain letters, numbers, and underscores'
    };
  }

  // Check for reserved keywords
  const reservedKeywords = [
    'constructor',
    'prototype',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty'
  ];

  if (reservedKeywords.includes(fieldName)) {
    return {
      valid: false,
      error: `Field name "${fieldName}" is a reserved keyword`
    };
  }

  return { valid: true };
}

/**
 * Validate schema definition
 */
export function validateSchema(schema: any): ValidationResult {
  if (!schema || typeof schema !== 'object') {
    return {
      valid: false,
      error: 'Schema must be an object'
    };
  }

  if (!schema.entityName) {
    return {
      valid: false,
      error: 'Schema must have an entityName'
    };
  }

  const entityValidation = validateEntityName(schema.entityName);
  if (!entityValidation.valid) {
    return entityValidation;
  }

  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    return {
      valid: false,
      error: 'Schema must have at least one field'
    };
  }

  // Validate each field
  for (const field of schema.fields) {
    if (!field.name) {
      return {
        valid: false,
        error: 'Each field must have a name'
      };
    }

    const fieldValidation = validateFieldName(field.name);
    if (!fieldValidation.valid) {
      return {
        valid: false,
        error: `Field "${field.name}": ${fieldValidation.error}`
      };
    }

    if (!field.type) {
      return {
        valid: false,
        error: `Field "${field.name}" must have a type`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate file extension
 */
export function validateFileExtension(
  fileName: string,
  allowedExtensions: string[]
): ValidationResult {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (!extension) {
    return {
      valid: false,
      error: 'File has no extension'
    };
  }

  if (!allowedExtensions.includes(`.${extension}`)) {
    return {
      valid: false,
      error: `File extension .${extension} is not allowed. Allowed: ${allowedExtensions.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Sanitize file name (remove dangerous characters)
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9_.-]/g, '_') // Replace non-alphanumeric (except _ . -) with _
    .replace(/\.+/g, '.') // Replace multiple dots with single dot
    .replace(/^\./, '') // Remove leading dot
    .substring(0, 255); // Limit length
}

/**
 * Validate base URL format
 */
export function validateBaseUrl(baseUrl: string): ValidationResult {
  if (!baseUrl || baseUrl.trim() === '') {
    return {
      valid: false,
      error: 'Base URL cannot be empty'
    };
  }

  // Must start with /
  if (!baseUrl.startsWith('/')) {
    return {
      valid: false,
      error: 'Base URL must start with /'
    };
  }

  // Must not end with /
  if (baseUrl.endsWith('/') && baseUrl.length > 1) {
    return {
      valid: false,
      error: 'Base URL must not end with /'
    };
  }

  // Check for valid characters
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(baseUrl)) {
    return {
      valid: false,
      error: 'Base URL contains invalid characters'
    };
  }

  return { valid: true };
}


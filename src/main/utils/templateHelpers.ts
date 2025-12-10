import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import Handlebars from 'handlebars';

/**
 * Get the Generator project root directory by finding package.json
 * Searches upward from the current file location until package.json is found
 */
export function getGeneratorRoot(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;

  if (isDev) {
    // Start from the current file location (dist-electron/main/utils/templateHelpers.js)
    const __filename = fileURLToPath(import.meta.url);
    let currentDir = dirname(__filename);

    // Go up until we find package.json (Generator root)
    while (currentDir !== dirname(currentDir)) {
      const packageJsonPath = join(currentDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        return currentDir;
      }
      currentDir = dirname(currentDir);
    }

    // Fallback: if package.json not found, go up two levels from dist-electron
    return resolve(dirname(__filename), '..', '..');
  } else {
    // In production, use app path
    return app.getAppPath();
  }
}

/**
 * Get the templates directory path for a specific template type
 * @param templateType - 'backend', 'frontend', or 'react'
 */
export function getTemplatesDir(templateType: 'backend' | 'frontend' | 'react' = 'backend'): string {
  const generatorRoot = getGeneratorRoot();
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;

  if (isDev) {
    // In development, use src/main/templates/{templateType}
    return join(generatorRoot, 'src', 'main', 'templates', templateType);
  } else {
    // In production, use dist-electron/main/templates/{templateType}
    return join(generatorRoot, 'dist-electron', 'main', 'templates', templateType);
  }
}

/**
 * Convert entity name to camelCase
 */
export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Get the project root path by detecting if 'src' exists in the path
 * If path contains 'src', return the path up to 'src', otherwise return the path as is
 * This handles cases like:
 * - /path/to/project/src -> /path/to/project
 * - /path/to/project/src/services -> /path/to/project
 * - /path/to/project -> /path/to/project (no src, assume root)
 */
export function getProjectRootPath(projectPath: string): string {
  // Normalize path separators
  const normalizedPath = projectPath.replace(/\\/g, '/').replace(/\/$/, ''); // Remove trailing slash

  // Check if path contains '/src/' (not at the end)
  const srcIndex = normalizedPath.indexOf('/src/');
  if (srcIndex !== -1) {
    // Path contains '/src/', return everything before it
    // This handles: /path/to/project/src/services, /path/to/project/src/store, etc.
    return normalizedPath.substring(0, srcIndex);
  }

  // Check if path ends with '/src'
  if (normalizedPath.endsWith('/src')) {
    // Path ends with '/src', return parent directory
    // This handles: /path/to/project/src
    return dirname(projectPath);
  }

  // No 'src' found, return path as is
  // This handles: /path/to/project (user selected project root)
  return projectPath;
}

/**
 * Register common Handlebars helpers used across all templates
 * This function should be called before compiling any template
 */
export function registerHandlebarsHelpers(): void {
  // Register currentDate helper for Turkish locale
  Handlebars.registerHelper('currentDate', () => {
    return new Date().toLocaleString('tr-TR');
  });

  // Register eq helper for equality comparison
  Handlebars.registerHelper('eq', (a, b) => {
    return a === b;
  });

  // Register toCamelCase helper
  Handlebars.registerHelper('toCamelCase', (str: string) => {
    return toCamelCase(str);
  });

  // Register hasSearchableFields helper to check if any field is searchable
  Handlebars.registerHelper('hasSearchableFields', (fields: Array<{ isSearchable?: boolean }>) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { isSearchable?: boolean }) => field.isSearchable === true);
  });

  // Register hasField helper to check if a field with specific name exists
  Handlebars.registerHelper('hasField', (fields: Array<{ name: string }>, fieldName: string) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { name: string }) => field.name === fieldName);
  });

  // Register hasSchemaType helper to check if any field has schema type
  Handlebars.registerHelper('hasSchemaType', (fields: Array<{ type: string }>) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { type: string }) => field.type === 'schema');
  });

  // Register getType helper to return mongoose.Types.ObjectId for schema type and Date for date type
  Handlebars.registerHelper('getType', (type: string) => {
    if (type === 'schema') {
      return 'mongoose.Types.ObjectId';
    }
    if (type === 'date') {
      return 'Date';
    }
    return type;
  });

  // Register lookup helper for accessing nested object properties (if not already registered by Handlebars)
  // Handlebars has built-in lookup, but we ensure it's available
  if (!Handlebars.helpers.lookup) {
    Handlebars.registerHelper('lookup', (obj: any, key: string) => {
      return obj && obj[key];
    });
  }

  // Register hasValue helper to check if a value exists (including false and 0)
  Handlebars.registerHelper('hasValue', (value: any) => {
    return value !== undefined && value !== null && value !== '';
  });
}

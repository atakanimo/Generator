import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import Handlebars from 'handlebars';
import { pluralize as pluralizeName } from './namingUtils.js';
import { fieldsHaveSearchable, uppercaseFirstStr } from './handlebars-schema-predicates.js';
import { fieldsHaveSchemaType, schemaFieldToBackendTsType } from '../../shared/schemaFieldTypes.js';
import { registerBeFilterHelpers } from './handlebars-be-filters.js';
import { emitZodFieldExpr } from '../../shared/fieldKind.js';
import { registerBeTypesHelpers } from './handlebars-be-types.js';

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
 * @param templateType - backend template set (`src/main/templates/<set>`); the admin FE is config, not templates (plan 6)
 */
export type TemplateSet = 'backend-express-mongoose' | 'backend-dotnet-efcore' | 'backend-python-fastapi' | 'client-redux';

export function getTemplatesDir(templateType: TemplateSet = 'backend-express-mongoose'): string {
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

/** Stacks whose core files ship as plain assets (`src/generator-assets/<stack>`). */
export type GeneratorAssetStack = 'express-mongoose' | 'dotnet-efcore' | 'python-fastapi' | 'admin-base' | 'client-http';

/**
 * Asset directory of a stack. Development: `src/generator-assets/<stack>`; packaged app:
 * `dist-electron/generator-assets/<stack>` (copied by `build-electron.js`, like the templates).
 */
export function getGeneratorAssetsDir(stack: GeneratorAssetStack): string {
  const generatorRoot = getGeneratorRoot();
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;
  return isDev ? join(generatorRoot, 'src', 'generator-assets', stack) : join(generatorRoot, 'dist-electron', 'generator-assets', stack);
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

  // Basic boolean helpers (used in templates to avoid deep nesting)
  Handlebars.registerHelper('and', (...args: any[]) => {
    const values = args.slice(0, -1); // last arg is Handlebars options
    return values.every(Boolean);
  });
  Handlebars.registerHelper('or', (...args: any[]) => {
    const values = args.slice(0, -1);
    return values.some(Boolean);
  });
  Handlebars.registerHelper('not', (v: any) => !v);

  Handlebars.registerHelper('uppercaseFirst', (str: unknown) => uppercaseFirstStr(str));

  // Register toCamelCase helper
  Handlebars.registerHelper('toCamelCase', (str: string) => {
    return toCamelCase(str);
  });

  // Register pluralize helper for naming consistency (e.g. User -> users)
  Handlebars.registerHelper('pluralize', (str: string) => {
    return pluralizeName(String(str ?? ''));
  });

  Handlebars.registerHelper('hasSearchableFields', (fields: unknown) => fieldsHaveSearchable(fields));

  // Register hasField helper to check if a field with specific name exists
  Handlebars.registerHelper('hasField', (fields: Array<{ name: string }>, fieldName: string) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { name: string }) => field.name === fieldName);
  });

  // Register hasSchemaType helper to check if any field has schema type
  Handlebars.registerHelper('hasSchemaType', (fields: unknown) => fieldsHaveSchemaType(fields));

  // Register getType helper to return mongoose.Types.ObjectId for schema type and Date for date type
  Handlebars.registerHelper('getType', (type: string) => schemaFieldToBackendTsType(type));

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

  // Register default helper: returns first arg if truthy/non-empty, else second (avoids nested #if in templates)
  Handlebars.registerHelper('default', (a: any, b: any) => {
    return a != null && a !== '' ? a : b;
  });

  /**
   * Build the right schema reference for admin routes when the module has `*AdminSchema` variants
   * (`adminSchemaVariant`: ownership field or adminOnly fields — see BackendGenerator.resolveNormalApi).
   * Returns a full `TSchema.X` expression string.
   *
   * Example:
   * - schemaRef('UserWatchList', 'GetAllBody', true, true) -> 'TSchema.UserWatchListGetAllBodyAdminSchema'
   * - schemaRef('SymbolTypes', 'GetAllBody', true, false) -> 'TSchema.SymbolTypesGetAllBodySchema'
   */
  Handlebars.registerHelper('schemaRef', (entityName: unknown, baseName: unknown, isAdmin: unknown, adminSchemaVariant: unknown) => {
    const ent = String(entityName || '').trim();
    const base = String(baseName || '').trim();
    const suffix = isAdmin === true && adminSchemaVariant === true ? 'AdminSchema' : 'Schema';
    return new Handlebars.SafeString(`TSchema.${ent}${base}${suffix}`);
  });

  /**
   * Schema templates must not contain type/flag business logic.
   * This helper renders a single Zod field line (or empty string if skipped).
   *
   * mode:
   * - base: full schema (excluding id fields)
   * - create: excludes readonly and hiddenFromCreate
   * - update: excludes readonly and hiddenFromUpdate, always optional
   * - filter: filter schema for get-all body (always optional)
   */
  Handlebars.registerHelper('zodField', (field: any, mode: 'base' | 'create' | 'update' | 'filter') => {
    if (!field || typeof field !== 'object') return '';
    const name = String(field.name || '').trim();
    if (!name || name === '_id' || name === 'id') return '';

    // Contract §5: `readonly` is never written (create and update), as on .NET.
    if ((mode === 'create' || mode === 'update') && field.isReadonly === true) return '';
    if (mode === 'create' && field.hiddenFromCreate === true) return '';
    if (mode === 'update' && field.hiddenFromUpdate === true) return '';

    if (mode === 'filter' && field.isSearchable !== true) return '';

    const expr = emitZodFieldExpr(field, mode);
    return new Handlebars.SafeString(`    ${name}: ${expr},\n`);
  });

  /**
   * Like zodField, but can omit/include ownership field (e.g., userId) based on endpoint type.
   * - For normal protected endpoints, ownership field must be omitted from body + filter DTOs;
   *   `adminOnly` fields are omitted from create / update bodies (G5).
   * - For admin endpoints (`allowOwnership` true), both may be included.
   */
  Handlebars.registerHelper(
    'zodFieldScoped',
    (
      field: any,
      mode: 'create' | 'update' | 'filter',
      ownershipFieldName: unknown,
      allowOwnership: unknown
    ) => {
      if (!field || typeof field !== 'object') return '';
      const name = String(field.name || '').trim();
      if (!name || name === '_id' || name === 'id') return '';

      const ownership = String(ownershipFieldName || '').trim();
      const isOwnership = ownership && name.toLowerCase() === ownership.toLowerCase();
      if (isOwnership && allowOwnership !== true) return '';
      // G5: adminOnly fields are not writable through the normal API (admin schemas keep them).
      if (allowOwnership !== true && field.adminOnly === true && (mode === 'create' || mode === 'update')) return '';

      if ((mode === 'create' || mode === 'update') && field.isReadonly === true) return '';
      if (mode === 'create' && field.hiddenFromCreate === true) return '';
      if (mode === 'update' && field.hiddenFromUpdate === true) return '';
      if (mode === 'filter' && field.isSearchable !== true) return '';

      const expr = emitZodFieldExpr(field, mode);
      return new Handlebars.SafeString(`    ${name}: ${expr},\n`);
    }
  );

  type PopulateField = {
    name?: string;
    includeRelation?: boolean;
    relationEntityName?: string;
    relationProperty?: string;
    relationPopulateFields?: string[];
  };

  const bePopulateEntries = (fields: unknown): Array<{ path: string; select: string }> => {
    if (!Array.isArray(fields)) return [];
    const out: Array<{ path: string; select: string }> = [];
    for (const raw of fields as PopulateField[]) {
      const name = String(raw?.name || '').trim();
      if (!name) continue;
      if (raw?.includeRelation !== true) continue;
      if (!raw?.relationEntityName) continue;

      const explicit = raw?.relationPopulateFields;
      let select: string;
      if (Array.isArray(explicit) && explicit.length > 0) {
        select = explicit.map(s => String(s).trim()).filter(Boolean).join(' ');
      } else {
        select = String(raw.relationProperty || '').trim();
      }
      if (!select) continue;
      out.push({ path: name, select });
    }
    return out;
  };

  const bePopulateLiteral = (entries: Array<{ path: string; select: string }>): string => {
    if (entries.length === 0) return '';
    if (entries.length === 1) {
      const e = entries[0]!;
      return `{ path: '${e.path}', select: '${e.select}' }`;
    }
    return `[${entries.map(e => `{ path: '${e.path}', select: '${e.select}' }`).join(', ')}]`;
  };

  Handlebars.registerHelper('beServicePopulateOptionLine', (fields: unknown) => {
    const entries = bePopulateEntries(fields);
    if (entries.length === 0) return '';
    return new Handlebars.SafeString(`,\n    populate: ${bePopulateLiteral(entries)}`);
  });

  Handlebars.registerHelper('beServiceGetByIdPopulateArgs', (fields: unknown, needsLean?: boolean) => {
    const entries = bePopulateEntries(fields);
    const lean = needsLean === true;
    if (entries.length === 0 && !lean) return '';
    const optionsParts: string[] = [];
    if (entries.length > 0) {
      optionsParts.push(`populate: ${bePopulateLiteral(entries)}`);
    }
    if (lean) {
      optionsParts.push('lean: false');
    }
    return new Handlebars.SafeString(`, {}, { ${optionsParts.join(', ')} }`);
  });

  Handlebars.registerHelper('beServiceLeanOptionLine', (needsLean?: boolean) => {
    if (needsLean !== true) return '';
    return new Handlebars.SafeString(`,\n    lean: false`);
  });

  registerBeTypesHelpers();
  registerBeFilterHelpers();
}

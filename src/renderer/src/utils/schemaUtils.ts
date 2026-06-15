import { FieldConfig, SchemaDefinition } from '../types/ProjectTypes';
import {
  enrichFieldWithUIConfig as enrichFieldShared,
  mergeSchema as mergeSchemaShared,
  getComponentForType,
  type UIComponent,
  type SourceType as MergeSourceType
} from '@shared/schemaMerge';

export type { UIComponent };
export { getComponentForType };

type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null;

/**
 * Determines if a field should be shown in forms
 * Excludes system fields like 'id', 'created_at', 'updated_at', etc.
 */
export function shouldShowInForm(fieldName: string): boolean {
  const excludedFields = ['id', '_id', 'createdat', 'created_at', 'updatedat', 'updated_at', 'deletedat', 'deleted_at', '__v', '__version'];

  const normalizedName = fieldName.toLowerCase().replace(/[_-]/g, '');
  return !excludedFields.includes(normalizedName);
}

/**
 * Determines if a field should be shown in tables
 * Similar to shouldShowInForm but might have different logic
 */
export function shouldShowInTable(fieldName: string): boolean {
  return shouldShowInForm(fieldName);
}

export function enrichFieldWithUIConfig(field: {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
  includeRelation?: boolean;
  relationEntityName?: string;
  relationProperty?: string;
  relationPopulateFields?: string[];
}): FieldConfig {
  return enrichFieldShared(field) as FieldConfig;
}

export function mergeSchema(
  codeSchema: {
    entityName: string;
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
      isArray: boolean;
      includeRelation?: boolean;
      relationEntityName?: string;
      relationProperty?: string;
      relationPopulateFields?: string[];
    }>;
    nestedSchemas?: Array<{
      entityName: string;
      fields: Array<{ name: string; type: string; required: boolean; isArray: boolean }>;
    }>;
  },
  savedSchema: unknown,
  sourceType?: SourceType
): SchemaDefinition {
  return mergeSchemaShared(codeSchema, savedSchema, sourceType as MergeSourceType) as SchemaDefinition;
}

/** Path of `absoluteFilePath` relative to `projectRoot` (POSIX slashes). */
export function filePathToProjectRelativePath(projectRoot: string, absoluteFilePath: string): string {
  const root = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const file = absoluteFilePath.replace(/\\/g, '/');
  const prefix = `${root}/`;
  if (file.startsWith(prefix)) {
    return file.slice(prefix.length);
  }
  return file.replace(/^\/+/, '');
}

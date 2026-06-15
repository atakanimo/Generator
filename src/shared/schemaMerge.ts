import { isMongooseSourceType } from './schemaFieldTypes.js';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null;

export type UIComponent =
  | 'TextField'
  | 'TextArea'
  | 'NumberField'
  | 'Switch'
  | 'Select'
  | 'DatePicker'
  | 'MultiSelect'
  | 'ImageField'
  | 'Autocomplete'
  | 'AsyncSelect'
  | 'Chips';

export type FilterType = 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range';

export interface CodeSchemaField {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
  includeRelation?: boolean;
  relationEntityName?: string;
  relationProperty?: string;
  relationPopulateFields?: string[];
  trim?: boolean;
  unique?: boolean;
}

export interface MergedFieldConfig extends CodeSchemaField {
  label: string;
  uiComponent: UIComponent;
  showInTable: boolean;
  isSearchable: boolean;
  filterType?: FilterType;
  defaultValue?: string;
  isReadonly?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
  relationType?: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
  trim?: boolean;
  unique?: boolean;
}

export interface MergedSchemaDefinition {
  entityName: string;
  fields: MergedFieldConfig[];
  nestedSchemas?: MergedSchemaDefinition[];
}

function isActiveRelation(field: {
  type: string;
  includeRelation?: boolean;
  relationEntityName?: string;
}): boolean {
  return field.includeRelation === true && field.type.toLowerCase() === 'schema' && Boolean(field.relationEntityName);
}

function resolveRelationType(field: {
  type: string;
  isArray: boolean;
  includeRelation?: boolean;
  relationEntityName?: string;
  relationType?: MergedFieldConfig['relationType'];
}): MergedFieldConfig['relationType'] | undefined {
  if (!isActiveRelation(field)) return undefined;
  if (field.relationType) return field.relationType;
  return field.isArray ? 'oneToMany' : 'manyToOne';
}

/** Drop relationType (and keep relation meta consistent) when includeRelation is off. */
export function sanitizeFieldRelationMeta(field: MergedFieldConfig): MergedFieldConfig {
  if (isActiveRelation(field)) {
    return {
      ...field,
      relationType: resolveRelationType(field)
    };
  }
  const { relationType: _rt, ...rest } = field;
  return rest;
}

/** Mongo `_id`: always required, ObjectId (`schema` type in field config). */
export function normalizeMongoIdField<T extends CodeSchemaField>(
  field: T,
  sourceType?: SourceType | null
): T {
  if (!isMongooseSourceType(sourceType) || field.name !== '_id') {
    return field;
  }
  return {
    ...field,
    type: 'schema',
    required: true,
    isArray: false
  };
}

function formatLabel(name: string): string {
  let formatted = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  formatted = formatted.replace(/_/g, ' ');
  formatted = formatted.replace(/-/g, ' ');
  return formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function getComponentForType(field: { name: string; type: string; isArray: boolean }): UIComponent {
  const name = field.name.toLowerCase();
  const type = field.type.toLowerCase();

  if (field.isArray) {
    return 'MultiSelect';
  }
  if (type === 'boolean') {
    return 'Switch';
  }
  if (type === 'date' || name.includes('date') || name.includes('time')) {
    return 'DatePicker';
  }
  if (type === 'number' || type === 'integer' || type === 'float') {
    return 'NumberField';
  }
  if (name.includes('description') || name.includes('content') || name.includes('body') || name.includes('message')) {
    return 'TextArea';
  }
  return 'TextField';
}

export function enrichFieldWithUIConfig(field: CodeSchemaField): MergedFieldConfig {
  const normalizedName = field.name.toLowerCase();
  const isSystemReadonly = normalizedName === '_id' || normalizedName === 'createdat' || normalizedName === 'updatedat';
  const isOwnershipField = normalizedName === 'userid';
  const defaultFilterType: FilterType =
    normalizedName === '_id' || normalizedName === 'id'
      ? 'objectId'
      : field.type.toLowerCase() === 'schema'
        ? 'objectId'
        : field.type.toLowerCase() === 'boolean'
          ? 'boolean'
          : field.type.toLowerCase() === 'number'
            ? 'exact'
            : field.type.toLowerCase() === 'date'
              ? 'date-range'
              : 'regex';

  const suggestedArrayComponent: UIComponent = isOwnershipField ? 'Select' : 'MultiSelect';
  const isRelation = field.includeRelation === true && Boolean(field.relationEntityName) && field.type.toLowerCase() === 'schema';

  return {
    ...field,
    label: formatLabel(field.name),
    uiComponent: isRelation ? 'Autocomplete' : field.isArray ? suggestedArrayComponent : getComponentForType(field),
    showInTable: true,
    isSearchable: true,
    filterType: defaultFilterType,
    defaultValue: '',
    isReadonly: isSystemReadonly,
    includeRelation: field.includeRelation,
    relationEntityName: field.relationEntityName,
    relationProperty: field.relationProperty,
    relationPopulateFields: field.relationPopulateFields,
    relationType: resolveRelationType(field),
    trim: field.type.toLowerCase() === 'string' ? field.trim : undefined,
    unique: field.unique
  };
}

export function mergeSchema(
  codeSchema: {
    entityName: string;
    fields: CodeSchemaField[];
    nestedSchemas?: Array<{
      entityName: string;
      fields: Array<{ name: string; type: string; required: boolean; isArray: boolean }>;
    }>;
  },
  savedSchema: unknown,
  sourceType?: SourceType
): MergedSchemaDefinition {
  const shouldInjectMongoId = isMongooseSourceType(sourceType);
  const ensureMongoIdField = (fields: Array<{ name: string; type: string; required: boolean; isArray: boolean }>): void => {
    if (!shouldInjectMongoId) return;
    if (fields.some(f => f.name === '_id')) return;
    fields.unshift({ name: '_id', type: 'schema', required: true, isArray: false });
  };

  if (!savedSchema) {
    const codeFields = [...codeSchema.fields];
    ensureMongoIdField(codeFields);
    return {
      entityName: codeSchema.entityName,
      fields: codeFields.map(field =>
        sanitizeFieldRelationMeta(enrichFieldWithUIConfig(normalizeMongoIdField(field, sourceType)))
      ),
      nestedSchemas: codeSchema.nestedSchemas?.map(nested => ({
        entityName: nested.entityName,
        fields: nested.fields.map(field => sanitizeFieldRelationMeta(enrichFieldWithUIConfig(field)))
      }))
    };
  }

  const savedFieldsMap = new Map<string, MergedFieldConfig>();
  const saved = savedSchema as MergedSchemaDefinition;
  saved.fields.forEach(field => {
    savedFieldsMap.set(field.name, field);
  });

  const codeFields = [...codeSchema.fields];
  ensureMongoIdField(codeFields);

  const mergedFields: MergedFieldConfig[] = codeFields.map(codeField => {
    const normalizedCodeField = normalizeMongoIdField(codeField, sourceType);
    const savedField = savedFieldsMap.get(normalizedCodeField.name);

    if (savedField) {
      const includeRelation =
        normalizedCodeField.includeRelation !== undefined
          ? normalizedCodeField.includeRelation
          : savedField.includeRelation;
      const relationEntityName =
        normalizedCodeField.relationEntityName !== undefined
          ? normalizedCodeField.relationEntityName
          : savedField.relationEntityName;

      const merged: MergedFieldConfig = {
        ...savedField,
        type: normalizedCodeField.type,
        required: normalizedCodeField.required,
        isArray: normalizedCodeField.isArray,
        includeRelation,
        relationEntityName,
        relationProperty:
          normalizedCodeField.relationProperty !== undefined
            ? normalizedCodeField.relationProperty
            : savedField.relationProperty,
        relationPopulateFields: savedField.relationPopulateFields,
        isSearchable: savedField.isSearchable !== undefined ? savedField.isSearchable : true,
        filterType: savedField.filterType || enrichFieldWithUIConfig(normalizedCodeField).filterType,
        defaultValue: savedField.defaultValue ?? '',
        isReadonly: savedField.isReadonly ?? enrichFieldWithUIConfig(normalizedCodeField).isReadonly,
        hiddenFromCreate: savedField.hiddenFromCreate,
        hiddenFromUpdate: savedField.hiddenFromUpdate,
        relationType: savedField.relationType,
        showInTable: savedField.showInTable !== undefined ? savedField.showInTable : true,
        trim: normalizedCodeField.trim !== undefined ? normalizedCodeField.trim : savedField.trim,
        unique: normalizedCodeField.unique !== undefined ? normalizedCodeField.unique : savedField.unique
      };
      return sanitizeFieldRelationMeta(normalizeMongoIdField(merged, sourceType));
    }

    return sanitizeFieldRelationMeta(enrichFieldWithUIConfig(normalizedCodeField));
  });

  const nestedSchemas = codeSchema.nestedSchemas?.map(nested => ({
    entityName: nested.entityName,
    fields: nested.fields.map(field => sanitizeFieldRelationMeta(enrichFieldWithUIConfig(field)))
  }));

  return {
    entityName: codeSchema.entityName,
    fields: mergedFields,
    nestedSchemas
  };
}

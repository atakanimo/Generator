import { FieldConfig, SchemaDefinition } from '../types/ProjectTypes';
import { formatLabel } from './stringUtils';

export type UIComponent = 'TextField' | 'TextArea' | 'NumberField' | 'Switch' | 'Select' | 'DatePicker' | 'MultiSelect';

/**
 * Determines the appropriate UI component based on field type and name
 */
export function getComponentForType(field: { name: string; type: string; isArray: boolean }): UIComponent {
  const name = field.name.toLowerCase();
  const type = field.type.toLowerCase();

  // Array fields -> MultiSelect
  if (field.isArray) {
    return 'MultiSelect';
  }

  // Boolean fields -> Switch
  if (type === 'boolean') {
    return 'Switch';
  }

  // Date fields -> DatePicker
  if (type === 'date' || name.includes('date') || name.includes('time')) {
    return 'DatePicker';
  }

  // Number fields -> NumberField
  if (type === 'number' || type === 'integer' || type === 'float') {
    return 'NumberField';
  }

  // Text fields with specific patterns
  if (name.includes('email')) {
    return 'TextField'; // Email input (could be specialized later)
  }

  if (name.includes('description') || name.includes('content') || name.includes('body') || name.includes('message')) {
    return 'TextArea';
  }

  // Default to TextField
  return 'TextField';
}

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
  // For now, same logic as shouldShowInForm
  // Can be customized later
  return shouldShowInForm(fieldName);
}

/**
 * Converts a parsed SchemaField to FieldConfig with UI defaults
 */
export function enrichFieldWithUIConfig(field: { name: string; type: string; required: boolean; isArray: boolean; includeRelation?: boolean; relationEntityName?: string; relationProperty?: string }): FieldConfig {
  return {
    ...field,
    label: formatLabel(field.name),
    uiComponent: getComponentForType(field),
    showInTable: true, // Default: all fields are shown in table
    showInForm: true, // Default: all fields are shown in form
    isSearchable: true, // Default: all fields are searchable
    // Preserve relation info from code schema
    includeRelation: field.includeRelation,
    relationEntityName: field.relationEntityName,
    relationProperty: field.relationProperty
  };
}

/**
 * Merges freshly parsed schema fields with saved UI configurations
 * - Preserves UI settings if field exists in both
 * - Adds new fields from code if they don't exist in saved config
 * - Removes fields that no longer exist in code
 */
export function mergeSchema(
  codeSchema: {
    entityName: string;
    fields: Array<{ name: string; type: string; required: boolean; isArray: boolean; includeRelation?: boolean; relationEntityName?: string; relationProperty?: string }>;
    nestedSchemas?: Array<{
      entityName: string;
      fields: Array<{ name: string; type: string; required: boolean; isArray: boolean }>;
    }>;
  },
  savedSchema: SchemaDefinition | null
): SchemaDefinition {
  // If no saved schema, return enriched code schema
  if (!savedSchema) {
    return {
      entityName: codeSchema.entityName,
      fields: codeSchema.fields.map(field => enrichFieldWithUIConfig(field)),
      nestedSchemas: codeSchema.nestedSchemas?.map(nested => ({
        entityName: nested.entityName,
        fields: nested.fields.map(field => enrichFieldWithUIConfig(field)) // Nested schemas also need UI config for type compatibility
      }))
    };
  }

  // Create a map of saved fields by name for quick lookup
  const savedFieldsMap = new Map<string, FieldConfig>();
  savedSchema.fields.forEach(field => {
    savedFieldsMap.set(field.name, field);
  });

  // Merge: for each field in code schema
  const mergedFields: FieldConfig[] = codeSchema.fields.map(codeField => {
    const savedField = savedFieldsMap.get(codeField.name);

    if (savedField) {
      // Field exists in both: preserve UI config (including isSearchable, showInForm, showInTable), but update type/required/isArray from code
      // Also preserve relation info from code schema if it exists (ref: extraction)
      return {
        ...savedField,
        type: codeField.type, // Type might have changed in code
        required: codeField.required, // Required might have changed
        isArray: codeField.isArray, // Array might have changed
        // Preserve relation info from code schema if it exists, otherwise use saved config
        includeRelation: codeField.includeRelation !== undefined ? codeField.includeRelation : savedField.includeRelation,
        relationEntityName: codeField.relationEntityName !== undefined ? codeField.relationEntityName : savedField.relationEntityName,
        relationProperty: codeField.relationProperty !== undefined ? codeField.relationProperty : savedField.relationProperty,
        // Preserve isSearchable from saved config, or default to true if not set
        isSearchable: savedField.isSearchable !== undefined ? savedField.isSearchable : true,
        // Preserve showInForm from saved config, or default to true if not set
        showInForm: savedField.showInForm !== undefined ? savedField.showInForm : true,
        // Preserve showInTable from saved config, or default to true if not set
        showInTable: savedField.showInTable !== undefined ? savedField.showInTable : true
      };
    } else {
      // New field in code: use defaults (isSearchable: true, showInForm: true, showInTable: true)
      // Include relation info from code schema if it exists
      return enrichFieldWithUIConfig(codeField);
    }
  });

  // Preserve nested schemas from code (enrich with UI config for type compatibility)
  const nestedSchemas = codeSchema.nestedSchemas?.map(nested => ({
    entityName: nested.entityName,
    fields: nested.fields.map(field => enrichFieldWithUIConfig(field)) // Nested schemas also need UI config for type compatibility
  }));

  return {
    entityName: codeSchema.entityName,
    fields: mergedFields,
    nestedSchemas
  };
}

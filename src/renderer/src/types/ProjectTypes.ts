/**
 * Project-related types and interfaces
 */

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
}

export interface FieldConfig {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
  // UI Configuration
  label: string;
  uiComponent: 'TextField' | 'TextArea' | 'NumberField' | 'Switch' | 'Select' | 'DatePicker' | 'MultiSelect' | 'ImageField';
  showInTable: boolean;
  showInForm: boolean;
  isSearchable: boolean;
  // Relation Configuration (for schema type fields)
  includeRelation?: boolean;
  relationProperty?: string; // e.g., "name", "email" - property to display from related entity
  relationEntityName?: string; // e.g., "User", "Symbol" - name of the related entity
  ref?: string; // Mongoose ref (e.g., "User", "Symbol") - used in schema definition
}

export interface SchemaDefinition {
  entityName: string;
  fields: FieldConfig[];
  nestedSchemas?: SchemaDefinition[];
}

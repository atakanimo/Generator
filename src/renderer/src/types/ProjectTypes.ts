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
  label: string;
  uiComponent:
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
  showInTable: boolean;
  isSearchable: boolean;
  filterType?: 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range';
  defaultValue?: string;
  isReadonly?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
  includeRelation?: boolean;
  relationProperty?: string;
  relationPopulateFields?: string[];
  relationPropertyObjectFields?: Array<{
    name: string;
    type: string;
    required: boolean;
    trim?: boolean;
  }>;
  relationEntityName?: string;
  relationType?: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
  ref?: string;
  trim?: boolean;
  unique?: boolean;
  objectFields?: Array<{
    name: string;
    type: string;
    required: boolean;
    trim?: boolean;
  }>;
}

export interface SchemaDefinition {
  entityName: string;
  fields: FieldConfig[];
  nestedSchemas?: SchemaDefinition[];
}

export type ModelScalarFieldType = 'String' | 'Number' | 'Boolean' | 'Date' | 'ObjectId' | 'Array' | 'Object';

export type ModelObjectSubFieldType = 'String' | 'Number' | 'Boolean';

export interface ModelObjectSubField {
  name: string;
  type: ModelObjectSubFieldType;
  required: boolean;
  trim: boolean;
}

export interface ModelField {
  name: string;
  type: ModelScalarFieldType;
  required: boolean;
  unique: boolean;
  trim: boolean;
  displayText?: string;
  ref?: string;
  objectFields?: ModelObjectSubField[];
}

export interface ModelData {
  modelName: string;
  fields: ModelField[];
  hasInitializeFunction: boolean;
  initializeData?: Array<Record<string, unknown>>;
  timestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
}

const defaultObjectSubField = (): ModelObjectSubField => ({
  name: '',
  type: 'String',
  required: false,
  trim: true
});

/** Normalize fields after parse or before save — fixes orphan Object types and strips stale objectFields. */
export function normalizeModelFields(fields: ModelField[]): ModelField[] {
  return fields.map(field => {
    if (field.type !== 'Object') {
      const { objectFields: _omit, ...rest } = field;
      return rest;
    }

    const namedSubs = (field.objectFields ?? []).filter(s => s.name.trim());
    if (namedSubs.length === 0) {
      return {
        ...field,
        type: 'String',
        unique: field.unique,
        trim: field.trim ?? true,
        objectFields: undefined
      };
    }

    return {
      ...field,
      unique: false,
      trim: false,
      objectFields: namedSubs
    };
  });
}

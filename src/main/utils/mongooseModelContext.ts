/**
 * Mongoose model context (plan 5 P3): v2 field → BE field view → `model.hbs` model fields.
 * Shared by backend generation (`BackendGenerator`) and model creation (`modelCreator`, R6).
 */
import type { NormalizedField as V2Field, NormalizedModel as V2Model, RelationType } from '../../shared/normalizedModel.js';
import { constraintsForField, DATE_ONLY_PATTERN, EMAIL_PATTERN, isNumericEnum, jsRegExpSource } from '../../shared/fieldConstraints.js';
import { filterNamedNestedNotOwnedByCustomTypes } from './namedNestedSchemaEmit.js';
import { filterTokenOf, kindFromTypeToken, templateScalarToken, typeTokenOf, type TemplateScalarToken } from '../../shared/fieldTypeToken.js';

export type SourceTypeLike = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null | undefined;

/** Template type tokens (`schema` = ObjectId reference), so template views copy them as they are. */
export type BeFieldType = 'string' | 'number' | 'boolean' | 'date' | 'schema' | 'array' | 'object';


/** BE view derived from a NormalizedModel v2 field (template / model.hbs context input) — not a second model. */
export interface BeField {
/** Fidelity (P3), from v2: enum / literal default / verbatim options / declared TS type, `?`, JSDoc. */
enumValues?: string[];
/** Numeric enum: stored / JSON value of `enumValues[i]`. */
enumNumbers?: number[];
numberFormat?: 'int' | 'float';
dateFormat?: 'datetime' | 'date';
format?: 'email';
constraints?: { minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string };
schemaDefault?: string | number | boolean | null;
nativeOptions?: string[];
tsTypeOverride?: string;
tsOptional?: boolean;
doc?: string;
name: string;
type: BeFieldType;
required: boolean;
isArray: boolean;
filterable: boolean;
filterType?: 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range';
defaultValue?: string;
isReadonly?: boolean;
hiddenFromCreate?: boolean;
hiddenFromUpdate?: boolean;
/** Never returned by generated CRUD (G2). */
hidden?: boolean;
/** Not writable through the normal API (G5). */
/** `access.detailOnly`: left out of list reads. */
detailOnly?: boolean;
/** `access.computed`: not in the Schema (never stored); optional in the interface, `hooks.mapRows` fills it. */
isComputed?: boolean;
adminOnly?: boolean;
relation?: {
  target: string;
  type: RelationType;
  displayField?: string;
};
relationPopulateFields?: string[];
relationPropertyObjectFields?: Array<{
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  trim: boolean;
}>;
relationType?: RelationType;
trim?: boolean;
unique?: boolean;
/** True when parsed type was `map` (Map of Number) — not a nested object. */
isMap?: boolean;
objectFields?: Array<{
  name: string;
  type: TemplateScalarToken;
  required: boolean;
  trim: boolean;
  nullable?: boolean;
  /** Decimal128 sub-field (its `type` token is `number`). */
  decimal?: boolean;
  ref?: string;
}>;
nestedTypeName?: string;
nestedSchemaName?: string;
ui: {
  showInTable: boolean;
  label: string;
  uiComponent?: string;
};
}


export type MongooseFieldShape = {
/** Interface `?` (P3, R3). */
optional?: boolean;
/** `access.computed`: interface only, left out of the Schema. */
computed?: boolean;
doc?: string;
tsTypeOverride?: string;
/** Rendered `'a', 'b'` (P3, R2). */
enumLiteral?: string;
minLength?: number;
maxLength?: number;
minimum?: number;
maximum?: number;
/** Rendered `new RegExp("…")`. */
matchLiteral?: string;
/** Rendered literal, e.g. `'none'`, `false`, `0`, `null` (P3, R2). */
defaultLiteral?: string;
/** Verbatim options, e.g. `uppercase: true` (P3). */
nativeOptions?: string[];
name: string;
tsType: string;
mongooseType: string;
required: boolean;
unique: boolean;
trim: boolean;
ref?: string;
isObject?: boolean;
isArray?: boolean;
isMap?: boolean;
nestedTypeName?: string;
nestedSchemaName?: string;
objectFields?: Array<{
  name: string;
  mongooseType: string;
  tsType: string;
  required: boolean;
  trim: boolean;
  nullable?: boolean;
  ref?: string;
}>;
};


export function mapFieldType(rawType: string, _isArray: boolean): BeFieldType {
  /** Keep element type (string, number, …); `isArray` on the field marks `[]` in TS/Mongoose — do not collapse to 'array'. */
  const kind = kindFromTypeToken(rawType);
  if (kind === 'json') {
    return 'object';
  }
  if (kind === 'decimal') {
    return 'number';
  }
  if (rawType === 'schema') {
    return 'schema';
  }
  if (rawType === 'date') {
    return 'date';
  }
  if (rawType === 'number') {
    return 'number';
  }
  if (rawType === 'boolean') {
    return 'boolean';
  }
  if (rawType === 'object' || rawType === 'map') {
    // Map is flagged via `isMap` on BeField; without objectFields it must not become Mixed.
    return 'object';
  }
  return 'string';
}


export function resolveFilterType(type: BeFieldType): 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range' {
  if (type === 'schema') {
    return 'objectId';
  }
  if (type === 'number') {
    return 'exact';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  if (type === 'date') {
    return 'date-range';
  }
  return 'regex';
}


/** BE view of a v2 field. */
export function normalizeField(field: V2Field): BeField {
  const rawType = String(typeTokenOf(field) || 'string').toLowerCase();
  const relationTarget = field.reference?.target ? String(field.reference.target) : undefined;
  const isArray = Boolean(field.isArray);
  const normalizedType = mapFieldType(rawType, isArray);
  // `computed` (derived when read): no filter, never written.
  const filterable = Boolean(field.filter?.searchable) && field.access?.computed !== true;
  const filterToken = filterTokenOf(field.filter);
  const populate = field.reference?.populate;
  const relationPopulateFields = Array.isArray(populate) ? populate.map(v => String(v).trim()).filter(Boolean) : undefined;
  const relationType: RelationType | undefined = relationTarget
    ? typeof field.reference?.relationType === 'string'
      ? field.reference.relationType
      : isArray
        ? 'oneToMany'
        : 'manyToOne'
    : undefined;
  const displayObjectFields = field.reference?.displayObjectFields;
  const objectSubFields = field.object?.fields;
  const isNamedObject = normalizedType === 'object' && rawType !== 'map';
  const nestedNames = isNamedObject
    ? resolveNestedNamesFromRaw({ nestedTypeName: field.object?.typeName, nestedSchemaName: field.object?.schemaName })
    : undefined;

  return {
    name: String(field.name || ''),
    type: normalizedType,
    required: Boolean(field.required),
    isArray,
    filterable,
    filterType: filterable
      ? typeof filterToken === 'string'
        ? (filterToken as BeField['filterType'])
        : resolveFilterType(normalizedType)
      : undefined,
    defaultValue: typeof field.ui?.defaultValue === 'string' ? field.ui.defaultValue : '',
    isReadonly: Boolean(field.access?.readonly) || field.access?.computed === true,
    hiddenFromCreate: Boolean(field.access?.hiddenFromCreate),
    hiddenFromUpdate: Boolean(field.access?.hiddenFromUpdate),
    hidden: field.access?.hidden === true ? true : undefined,
    detailOnly: field.access?.detailOnly === true ? true : undefined,
    isComputed: field.access?.computed === true ? true : undefined,
    adminOnly: field.access?.adminOnly === true ? true : undefined,
    relation:
      relationTarget && relationType
        ? {
            target: relationTarget,
            type: relationType,
            displayField: field.reference?.display ? String(field.reference.display) : undefined
          }
        : undefined,
    relationPopulateFields: relationPopulateFields && relationPopulateFields.length > 0 ? relationPopulateFields : undefined,
    relationPropertyObjectFields:
      Array.isArray(displayObjectFields) && displayObjectFields.length > 0
        ? displayObjectFields
            .map(sub => ({
              name: String(sub.name || '').trim(),
              type: (sub.type === 'number' ? 'number' : sub.type === 'boolean' ? 'boolean' : 'string') as
                | 'string'
                | 'number'
                | 'boolean',
              required: Boolean(sub.required),
              trim: sub.type === 'string' || sub.type === 'String' ? sub.trim !== false : false,
            }))
            .filter(sub => sub.name)
        : undefined,
    relationType,
    trim: typeof field.trim === 'boolean' ? field.trim : undefined,
    unique: typeof field.unique === 'boolean' ? field.unique : undefined,
    isMap: rawType === 'map' ? true : undefined,
    objectFields:
      isNamedObject && Array.isArray(objectSubFields)
        ? objectSubFields
            .map(sub => {
              const type = templateScalarToken(sub.kind);
              const ref =
                type === 'schema'
                  ? String(sub.reference?.ref || sub.reference?.target || '').trim() || undefined
                  : undefined;
              return {
                name: String(sub.name || '').trim(),
                type,
                required: Boolean(sub.required),
                trim: type === 'string' ? sub.trim !== false : false,
                nullable: sub.nullable === true ? true : undefined,
                // `templateScalarToken` folds decimal into number; the model must keep Decimal128.
                decimal: sub.kind === 'decimal' ? true : undefined,
                ref
              };
            })
            .filter(sub => sub.name)
        : undefined,
    nestedTypeName: nestedNames?.nestedTypeName,
    nestedSchemaName: nestedNames?.nestedSchemaName,
    enumValues: field.enum?.values,
    enumNumbers: isNumericEnum(field.enum) ? field.enum.numbers : undefined,
    numberFormat: field.numberFormat,
    dateFormat: field.dateFormat,
    format: field.format,
    constraints: constraintsForField(field, field.constraints),
    schemaDefault: field.default,
    nativeOptions: field.native?.options,
    tsTypeOverride: field.native?.tsType,
    tsOptional: field.native?.tsOptional,
    doc: field.native?.doc,
    ui: {
      showInTable: field.ui?.list !== false,
      label: String(field.ui?.label || field.name || ''),
      uiComponent: field.ui?.component ? String(field.ui.component) : undefined
    }
  };
}


export function resolveNestedNamesFromRaw(field: Record<string, unknown>): {
  nestedTypeName?: string;
  nestedSchemaName?: string;
} {
  let nestedTypeName = typeof field.nestedTypeName === 'string' ? field.nestedTypeName.trim() : '';
  let nestedSchemaName = typeof field.nestedSchemaName === 'string' ? field.nestedSchemaName.trim() : '';
  if (nestedSchemaName && !nestedTypeName) {
    nestedTypeName = `I${nestedSchemaName.replace(/Schema$/i, '')}`;
  } else if (nestedTypeName && !nestedSchemaName) {
    const base = nestedTypeName.replace(/^I/, '');
    nestedSchemaName = /Schema$/i.test(base) ? base : `${base}Schema`;
  }
  return {
    nestedTypeName: nestedTypeName || undefined,
    nestedSchemaName: nestedSchemaName || undefined
  };
}

export function normalizeMongoIdField(field: BeField, sourceType: SourceTypeLike): BeField {
  if (sourceType !== 'nodejs-mongoose' || field.name !== '_id') {
    return field;
  }
  return { ...field, type: 'schema', required: true, isArray: false };
}


function toMongooseModelFieldsBase(fields: BeField[], sourceType: SourceTypeLike): MongooseFieldShape[] {
  return fields.map(field => {
    const effectiveType = sourceType === 'nodejs-mongoose' && field.name === '_id' ? 'schema' : field.type;

    if (field.isMap === true) {
      return {
        name: field.name,
        tsType: 'Map<string, number>',
        mongooseType: 'Map',
        required: field.required,
        unique: field.unique === true,
        trim: false,
        isObject: false,
        isMap: true
      };
    }

    if (effectiveType === 'object' && field.objectFields?.length) {
      return {
        name: field.name,
        tsType: '',
        mongooseType: '',
        required: field.required,
        unique: field.unique === true,
        trim: false,
        isObject: true,
        isArray: field.isArray === true ? true : undefined,
        nestedTypeName: field.nestedTypeName,
        nestedSchemaName: field.nestedSchemaName,
        objectFields: field.objectFields.map(sub => {
          let mongooseType = 'String';
          let tsType = 'string';
          let ref: string | undefined;
          if (sub.decimal === true) {
            mongooseType = 'Schema.Types.Decimal128';
            tsType = sub.nullable ? 'mongoose.Types.Decimal128 | null' : 'mongoose.Types.Decimal128';
          } else if (sub.type === 'number') {
            mongooseType = 'Number';
            tsType = sub.nullable ? 'number | null' : 'number';
          } else if (sub.type === 'boolean') {
            mongooseType = 'Boolean';
            tsType = 'boolean';
          } else if (sub.type === 'date') {
            mongooseType = 'Date';
            tsType = 'Date';
          } else if (sub.type === 'schema') {
            mongooseType = 'Schema.Types.ObjectId';
            tsType = 'mongoose.Types.ObjectId';
            ref = sub.ref;
          }
          return {
            name: sub.name,
            mongooseType,
            tsType,
            required: sub.required,
            trim: sub.trim && sub.type === 'string',
            nullable: sub.nullable === true ? true : undefined,
            ref
          };
        })
      };
    }

    const mongooseBaseType = toMongooseBaseType(effectiveType);
    const mongooseType = field.isArray ? `[${mongooseBaseType}]` : mongooseBaseType;
    const tsBaseType = toTsBaseType(effectiveType);
    const tsType = field.isArray ? `${tsBaseType}[]` : tsBaseType;

    return {
      name: field.name,
      tsType,
      mongooseType,
      required: field.required,
      unique: field.unique === true,
      trim: effectiveType === 'string' && field.trim === true,
      ref: field.relation?.target,
      isObject: false
    };
  });
}


export function toMongooseBaseType(type: BeFieldType): string {
  switch (type) {
    case 'number':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'schema':
      return 'Schema.Types.ObjectId';
    case 'object':
      return 'Schema.Types.Mixed';
    case 'array':
      // array element type is handled via isArray on field
      return 'Schema.Types.Mixed';
    case 'string':
    default:
      return 'String';
  }
}


export function toTsBaseType(type: BeFieldType): string {
  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date';
    case 'schema':
      return 'mongoose.Types.ObjectId';
    case 'object':
      return 'Record<string, unknown>';
    case 'array':
      return 'unknown';
    case 'string':
    default:
      return 'string';
  }
}


export function collectNamedNestedSchemas(
  modelFields: MongooseFieldShape[]
): Array<{
  nestedTypeName: string;
  nestedSchemaName: string;
  objectFields: NonNullable<MongooseFieldShape['objectFields']>;
}> {
  const seen = new Set<string>();
  const out: Array<{
    nestedTypeName: string;
    nestedSchemaName: string;
    objectFields: NonNullable<MongooseFieldShape['objectFields']>;
  }> = [];
  for (const field of modelFields) {
    const nestedTypeName = String(field.nestedTypeName ?? '').trim();
    const nestedSchemaName = String(field.nestedSchemaName ?? '').trim();
    if (!nestedTypeName || !nestedSchemaName || !field.objectFields?.length) continue;
    const key = nestedSchemaName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nestedTypeName, nestedSchemaName, objectFields: field.objectFields });
  }
  return out;
}

/** Interface JSDoc of a `computed` field without its own. */
export const COMPUTED_DOC = '/** computed: not stored; hooks.mapRows fills it. */';

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function renderLiteral(value: string | number | boolean | null): string {
  return typeof value === 'string' ? quote(value) : String(value);
}

/** `model.hbs` model fields with fidelity from the source model (P3: R2, R3). */
export function toMongooseModelFields(fields: BeField[], sourceType: SourceTypeLike): MongooseFieldShape[] {
  return toMongooseModelFieldsBase(fields, sourceType).map((shape, i) => {
    const field = fields[i]!;
    const out: MongooseFieldShape = { ...shape, optional: field.tsOptional ?? !field.required };
    if (field.doc) out.doc = field.doc;
    if (field.tsTypeOverride) out.tsTypeOverride = field.tsTypeOverride;
    if (field.enumNumbers?.length) {
      out.enumLiteral = field.enumNumbers.join(', ');
      out.mongooseType = field.isArray ? '[Number]' : 'Number';
      const union = field.enumNumbers.join(' | ');
      out.tsType = field.isArray ? `(${union})[]` : union;
    } else if (field.enumValues?.length) {
      out.enumLiteral = field.enumValues.map(quote).join(', ');
    }
    // Date-only: BSON has no calendar-day type; a `YYYY-MM-DD` string keeps the wire value and sorts correctly.
    if (field.type === 'date' && field.dateFormat === 'date') {
      out.mongooseType = field.isArray ? '[String]' : 'String';
      out.tsType = field.isArray ? 'string[]' : 'string';
      delete out.tsTypeOverride; // a declared `Date` from an earlier datetime version no longer fits
      out.matchLiteral = jsRegExpSource(DATE_ONLY_PATTERN);
    }
    // `constraints` is already narrowed to single strings / numbers (`constraintsForField` in `normalizeField`).
    const limits = field.constraints;
    if (limits?.minLength != null) out.minLength = limits.minLength;
    if (limits?.maxLength != null) out.maxLength = limits.maxLength;
    if (limits?.min != null) out.minimum = limits.min;
    if (limits?.max != null) out.maximum = limits.max;
    if (!field.isArray && field.format === 'email') out.matchLiteral = jsRegExpSource(EMAIL_PATTERN);
    else if (limits?.pattern) out.matchLiteral = jsRegExpSource(limits.pattern);
    if (field.schemaDefault !== undefined) out.defaultLiteral = renderLiteral(field.schemaDefault);
    if (field.nativeOptions?.length) out.nativeOptions = field.nativeOptions;
    if (field.isComputed) {
      // Interface-only: the parser reads "in the interface, not in the Schema" back as `computed`.
      out.computed = true;
      out.optional = true;
      // The parser keys on a `computed` JSDoc; an unrelated one is replaced.
      if (!out.doc || !/\bcomputed\b/.test(out.doc)) out.doc = COMPUTED_DOC;
    }
    return out;
  });
}

export interface MongooseModelContextOptions {
  pascalName: string;
  sourceType: SourceTypeLike;
  /** Current model file: named nested schemas owned by `custom-types` are not re-emitted. */
  existingContent?: string | null;
  /** Used when the model does not say (`model.timestamps` absent). */
  timestampsFallback: { createdAt: boolean; updatedAt: boolean };
  modelName?: string;
  interfaceExtends?: string;
  hasModelTypePattern?: boolean;
  initialize?: { functionName: string; data: Array<{ initLines: string }> };
}

/** Full `model.hbs` context from a v2 model — the one builder for backend generation and model creation (R6). */
export function buildMongooseModelContext(model: V2Model, opts: MongooseModelContextOptions): Record<string, unknown> {
  const fields = model.fields.map(f => normalizeMongoIdField(normalizeField(f), opts.sourceType));
  const modelFields = toMongooseModelFields(fields, opts.sourceType).filter(f => {
    const n = String(f.name).trim();
    return n !== '_id' && n !== 'createdAt' && n !== 'updatedAt';
  });
  const timestamps = model.timestamps ?? opts.timestampsFallback;
  const named = collectNamedNestedSchemas(modelFields);
  const p = opts.pascalName;
  return {
    interfaceName: `I${p}`,
    interfaceExtends: opts.interfaceExtends ?? 'Document',
    schemaName: `${p}Schema`,
    modelExportName: p,
    modelName: opts.modelName ?? p,
    /** `mongoose.model('…')` name: from the source file when known (it decides the collection). */
    mongooseModelName: model.native?.modelName ?? p,
    /** Explicit `collection` schema option of the source model (else Mongoose derives it from the model name). */
    collectionName: model.native?.collection,
    hasTimestamps: timestamps.createdAt || timestamps.updatedAt,
    timestamps,
    hasModelTypePattern: opts.hasModelTypePattern ?? false,
    hasInitializeFunction: Boolean(opts.initialize),
    initializeFunctionName: opts.initialize?.functionName,
    initializeData: opts.initialize?.data ?? [],
    modelFields,
    /** Schema keys: `computed` fields are never stored. */
    schemaFields: modelFields.filter(f => !f.computed),
    namedNestedSchemas: opts.existingContent ? filterNamedNestedNotOwnedByCustomTypes(named, opts.existingContent) : named
  };
}

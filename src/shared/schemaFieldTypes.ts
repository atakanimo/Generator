import { kindFromTypeToken, templateScalarToken } from './fieldTypeToken.js';

/**
 * Field as the BE Handlebars templates see it (`BackendGenerator.toTemplateFields` view of a `BeField`):
 * parser type tokens (`string`, `schema`, `object`, …), not a model shape. The model itself is NormalizedModel v2.
 */
export type TemplateObjectSubField = {
  name?: string;
  type?: string;
  required?: boolean;
  trim?: boolean;
  nullable?: boolean;
  /** Decimal128 sub-field: a number or a decimal string (contract K5), like a top-level decimal field. */
  decimal?: boolean;
  /** Nested ObjectId / relation inside object or array-of-object. */
  includeRelation?: boolean;
  relationEntityName?: string;
  ref?: string;
};

export type TemplateField = {
  name?: string;
  type?: string;
  required?: boolean;
  isArray?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
  objectFields?: TemplateObjectSubField[];
  nestedTypeName?: string;
  nestedSchemaName?: string;
  /** Enum values (P3 parse) — string fields only. */
  enumValues?: string[];
  /** Numeric enum: `enumNumbers[i]` is the stored / JSON value of `enumValues[i]`. */
  enumNumbers?: number[];
  numberFormat?: 'int' | 'float';
  dateFormat?: 'datetime' | 'date';
  format?: 'email';
  constraints?: { minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string };
  /** Takes / returns `null` (BE: model `default: null`). */
  nullable?: boolean;
  /** Literal model `default:` (BE create schema `.default(...)`). */
  schemaDefault?: string | number | boolean;
};

/** Single-quoted TS / JS string literal. */
export function tsStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Enum values of a string field (`enumValues` from P3 parse), or null. Numeric enums are not strings. */
export function enumValuesOf(field: { type?: string; enumValues?: unknown; enumNumbers?: unknown }): string[] | null {
  if (Array.isArray(field.enumNumbers) && field.enumNumbers.length > 0) return null;
  const values = field.enumValues;
  if (!Array.isArray(values) || values.length === 0 || String(field.type ?? '').trim().toLowerCase() !== 'string') return null;
  return values.map(v => String(v));
}

/** Numbers of a numeric enum field, or null. */
export function enumNumbersOf(field: { enumNumbers?: unknown }): number[] | null {
  return Array.isArray(field.enumNumbers) && field.enumNumbers.length > 0 ? field.enumNumbers.map(Number) : null;
}

/** TS union of an enum field's values, e.g. `'active' | 'expired'` or `0 | 5`, or null. */
export function enumTsUnion(field: { type?: string; enumValues?: unknown; enumNumbers?: unknown }): string | null {
  const numbers = enumNumbersOf(field);
  if (numbers) return numbers.map(String).join(' | ');
  return enumValuesOf(field)?.map(tsStringLiteral).join(' | ') ?? null;
}

/** Normalize a sub-field type token to a TS primitive / id name. */
export function objectSubFieldTsType(type: unknown): 'string' | 'number' | 'boolean' {
  // objectId / schema / string → string (wire-friendly for DTO / Zod)
  const t = templateScalarToken(kindFromTypeToken(String(type ?? '')));
  return t === 'number' || t === 'boolean' ? t : 'string';
}

/** Usable embedded-object sub-fields (named only). Returns [] when not an object field. */
export function getObjectSubFields(field: { type?: string; objectFields?: TemplateObjectSubField[] }): TemplateObjectSubField[] {
  if (String(field?.type ?? '').toLowerCase() !== 'object') return [];
  if (!Array.isArray(field.objectFields)) return [];
  return field.objectFields.filter(s => String(s?.name ?? '').trim() !== '');
}

function objectSubFieldTsTypeWithNull(sub: TemplateObjectSubField): string {
  const prim = objectSubFieldTsType(sub.type);
  return sub.nullable ? `${prim} | null` : prim;
}

/** TS inline type for an embedded object field, e.g. `{ tr: string; en: string }`. Falls back to `unknown`.
 * Always inlines `objectFields` (never emits unresolved nestedTypeName) so FE/BE DTOs stay self-contained.
 * Model files reference nestedTypeName via model.hbs separately.
 */
export function emitObjectTsLiteral(field: { type?: string; objectFields?: TemplateObjectSubField[]; nestedTypeName?: string }): string {
  const subs = getObjectSubFields(field);
  if (subs.length === 0) return 'unknown';
  const parts = subs.map(s => {
    const name = String(s.name).trim();
    const optional = s.required ? '' : '?';
    return `${name}${optional}: ${objectSubFieldTsTypeWithNull(s)}`;
  });
  return `{ ${parts.join('; ')} }`;
}

/** Zod schema for an embedded object field, e.g. `z.object({ tr: z.string(), en: z.string() }).strict()`. */
export function emitObjectZodLiteral(field: { type?: string; objectFields?: TemplateObjectSubField[] }): string {
  const subs = getObjectSubFields(field);
  if (subs.length === 0) return 'z.record(z.string(), z.unknown())';
  const parts = subs.map(s => {
    const name = String(s.name).trim();
    const prim = objectSubFieldTsType(s.type);
    let zod = s.decimal
      ? 'z.union([z.number(), z.string()])'
      : prim === 'number'
        ? 'z.number()'
        : prim === 'boolean'
          ? 'z.boolean()'
          : 'z.string()';
    if (s.nullable) zod = `${zod}.nullable()`;
    const suffix = s.required ? '' : '.optional()';
    return `${name}: ${zod}${suffix}`;
  });
  return `z.object({ ${parts.join(', ')} }).strict()`;
}

export function isMongooseSourceType(sourceType: unknown): boolean {
  return String(sourceType ?? '') === 'nodejs-mongoose';
}

/** Mongo → `_id`; diğer stack'ler → `id`. */
export function resolvePrimaryKeyFieldName(sourceType: unknown): '_id' | 'id' {
  return isMongooseSourceType(sourceType) ? '_id' : 'id';
}

export function fieldsIncludeNamedField(fields: unknown, fieldName: string): boolean {
  if (!Array.isArray(fields)) return false;
  return fields.some(f => f && String((f as TemplateField).name) === fieldName);
}

export function fieldsIncludePrimaryKey(sourceType: unknown, fields: unknown): boolean {
  return fieldsIncludeNamedField(fields, resolvePrimaryKeyFieldName(sourceType));
}

export function fieldsHaveSchemaType(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return (fields as TemplateField[]).some(f => String(f?.type ?? '').toLowerCase() === 'schema');
}

export function needsMongooseImportForTypes(sourceType: unknown, fields: unknown): boolean {
  return isMongooseSourceType(sourceType) || fieldsHaveSchemaType(fields);
}

/** BE `types.hbs` / `getType` helper: şema alan tipi → TS tip string. */
export function schemaFieldToBackendTsType(type: unknown): string {
  const raw = String(type || '').trim();
  const t = raw.toLowerCase();
  if (t === 'schema') return 'mongoose.Types.ObjectId';
  if (t === 'date') return 'Date';
  if (t === 'object') return 'unknown';
  if (t === 'map') return 'Record<string, number>';
  const kind = kindFromTypeToken(t);
  if (kind === 'decimal') return 'string | number';
  if (kind === 'json') return 'unknown';
  return raw || 'string';
}

export function isPrimaryKeyFieldName(name: unknown, sourceType: unknown): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  const pk = resolvePrimaryKeyFieldName(sourceType);
  return n === pk || n === '_id' || n === 'id';
}

export function emitBackendInterfacePropLine(field: TemplateField): string {
  const name = String(field.name ?? '').trim();
  if (!name) return '';
  const optional = field.required ? '' : '?';
  const enumUnion = enumTsUnion(field);
  const base =
    String(field.type ?? '').toLowerCase() === 'object'
      ? emitObjectTsLiteral(field)
      : enumUnion
        ? field.isArray
          ? `(${enumUnion})`
          : enumUnion
        : schemaFieldToBackendTsType(field.type);
  const ts = field.isArray ? `${base}[]` : base;
  return `  ${name}${optional}: ${ts}${field.nullable === true ? ' | null' : ''};\n`;
}

export function emitBackendEntitySyntheticPrimaryKeyLine(sourceType: unknown, fields: unknown): string {
  if (fieldsIncludePrimaryKey(sourceType, fields)) return '';
  if (isMongooseSourceType(sourceType)) {
    return '  _id: mongoose.Types.ObjectId;\n';
  }
  return '  id?: string;\n';
}

function shouldSkipBackendInputProp(
  field: TemplateField,
  sourceType: unknown,
  isProtectedRoute: unknown
): boolean {
  const name = String(field.name ?? '').trim();
  if (!name) return true;
  if (isPrimaryKeyFieldName(name, sourceType)) return true;
  if (field.hiddenFromCreate && field.hiddenFromUpdate) return true;
  if (isProtectedRoute === true && name.toLowerCase() === 'userid') return true;
  return false;
}

export function emitBackendInputPropLines(
  fields: unknown,
  sourceType: unknown,
  isProtectedRoute: unknown
): string {
  if (!Array.isArray(fields)) return '';
  let out = '';
  for (const raw of fields) {
    const field = raw as TemplateField;
    if (shouldSkipBackendInputProp(field, sourceType, isProtectedRoute)) continue;
    out += emitBackendInterfacePropLine(field);
  }
  return out;
}

/** TS type of one list filter value (`Get<Entity>Filters`, contract §3). */
function backendFilterTsType(field: TemplateField & { filterType?: string }): string {
  const filterType = String(field.filterType ?? '');
  if (filterType === 'range') return '{ min?: number; max?: number } | number';
  if (filterType === 'date-range') return '{ from?: string | Date; to?: string | Date } | string | Date';
  if (filterType === 'objectId') return 'string';
  const enumUnion = enumTsUnion(field);
  if (filterType === 'enum' && enumUnion) return `${enumUnion} | Array<${enumUnion}>`;
  const type = String(field.type ?? '');
  if (type === 'date') return 'string | Date';
  return type;
}

/** `Get<Entity>Filters` property lines: searchable fields except the built-in `id` / `_id`. */
export function emitBackendFilterPropLines(fields: unknown): string {
  if (!Array.isArray(fields)) return '';
  let out = '';
  for (const raw of fields) {
    const field = raw as TemplateField & { isSearchable?: boolean; filterType?: string };
    const name = String(field.name ?? '').trim();
    if (!name || name === '_id' || name === 'id' || field.isSearchable !== true) continue;
    out += `  ${name}?: ${backendFilterTsType(field)};\n`;
  }
  return out;
}

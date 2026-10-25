/**
 * Field-kind classifier + Zod emit helpers for the BE templates.
 * Prefer this over scattered `if (type === …)` in templates/helpers.
 */

import {
  enumNumbersOf,
  enumValuesOf,
  tsStringLiteral,
  emitObjectZodLiteral,
  type TemplateField
} from './schemaFieldTypes.js';
import { DATE_ONLY_PATTERN, EMAIL_PATTERN, jsRegExpSource } from './fieldConstraints.js';
import { kindFromTypeToken } from './fieldTypeToken.js';
import { updateNullClears } from './normalizedModel.js';

export type FieldKindName =
  | 'primaryKey'
  | 'relation'
  | 'nestedObject'
  | 'nestedObjectArray'
  | 'primitiveArray'
  | 'map'
  | 'decimal'
  | 'scalar'
  | 'opaque';

export type ClassifiedField = {
  kind: FieldKindName;
  field: TemplateField & {
    includeRelation?: boolean;
    relationEntityName?: string;
    name?: string;
  };
};

function typeToken(field: { type?: string }): string {
  return String(field?.type ?? '').trim().toLowerCase();
}

/** Classify a parsed / enriched schema field. */
export function classifyField(field: TemplateField & Record<string, unknown>): ClassifiedField {
  const f = field as ClassifiedField['field'];
  const t = typeToken(f);
  const isArr = Boolean(f.isArray);
  const name = String(f.name ?? '').trim();

  if (name === '_id' || name === 'id') {
    return { kind: 'primaryKey', field: f };
  }
  if (t === 'map') {
    return { kind: 'map', field: f };
  }
  if (kindFromTypeToken(t) === 'decimal') {
    return { kind: 'decimal', field: f };
  }
  if (t === 'object') {
    return { kind: isArr ? 'nestedObjectArray' : 'nestedObject', field: f };
  }
  if (f.includeRelation === true && t === 'schema') {
    return { kind: 'relation', field: f };
  }
  if (isArr && (t === 'string' || t === 'number' || t === 'boolean' || t === 'date')) {
    return { kind: 'primitiveArray', field: f };
  }
  if (t === 'schema' && isArr) {
    // Unbound array-subdoc (should be rebound to object+objectFields in parser)
    return { kind: 'opaque', field: f };
  }
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'date' || t === 'schema') {
    return { kind: 'scalar', field: f };
  }
  return { kind: 'opaque', field: f };
}

function zodRegex(pattern: string): string {
  return `.regex(${jsRegExpSource(pattern)})`;
}

function numericEnumZod(numbers: readonly number[]): string {
  const lits = numbers.map(n => `z.literal(${n})`);
  return lits.length === 1 ? lits[0]! : `z.union([${lits.join(', ')}])`;
}

function isDateRangeFilter(field: Record<string, unknown>, mode: string): boolean {
  return mode === 'filter' && String(field.filterType ?? '').toLowerCase() === 'date-range';
}

/**
 * Inner Zod expression (no optional / array wrapper). `field.constraints` is already narrowed by `constraintsForField`
 * (single strings / numbers only), so no array checks here.
 */
export function emitZodInner(field: TemplateField & Record<string, unknown>, mode: 'create' | 'update' | 'filter' | 'base'): string {
  const { kind } = classifyField(field);
  const t = typeToken(field);
  const constraints = field.constraints;

  if (kind === 'map') {
    return 'z.record(z.string(), z.number())';
  }
  if (kind === 'decimal') {
    let expr = 'z.union([z.number(), z.string()])';
    if (constraints?.min != null) expr += `.refine(v => Number(v) >= ${constraints.min})`;
    if (constraints?.max != null) expr += `.refine(v => Number(v) <= ${constraints.max})`;
    return expr;
  }
  const enumNumbers = enumNumbersOf(field);
  if (enumNumbers) {
    const zEnum = numericEnumZod(enumNumbers);
    if (mode === 'filter' && !field.isArray) return `z.union([${zEnum}, z.array(${zEnum}).min(1)])`;
    return zEnum;
  }
  const enumValues = enumValuesOf(field);
  if (enumValues) {
    const zEnum = `z.enum([${enumValues.map(tsStringLiteral).join(', ')}])`;
    // Enum filter: one value (equality) or a list (`$in`) — contract §3.
    if (mode === 'filter' && !field.isArray) return `z.union([${zEnum}, z.array(${zEnum}).min(1)])`;
    return zEnum;
  }
  if (kind === 'nestedObject' || kind === 'nestedObjectArray') {
    return emitObjectZodLiteral(field);
  }
  if (t === 'schema' || kind === 'relation') {
    // `objectIdString` is declared at the top of `schema.hbs`: a bad id is a 400, not a 500 in the filter builder.
    return mode === 'filter' ? 'objectIdString' : 'z.string()';
  }
  if (t === 'number') {
    let expr = field.numberFormat === 'int' ? 'z.number().int()' : 'z.number()';
    if (constraints?.min != null) expr += `.min(${constraints.min})`;
    if (constraints?.max != null) expr += `.max(${constraints.max})`;
    return expr;
  }
  if (t === 'boolean') return 'z.boolean()';
  if (t === 'date') {
    const rangeFilter = isDateRangeFilter(field, mode);
    // Date-only: a `YYYY-MM-DD` string in and out (stored as that string in Mongo, see `mongooseModelContext`).
    if (field.dateFormat === 'date' && !rangeFilter) return `z.string()${zodRegex(DATE_ONLY_PATTERN)}`;
    if (rangeFilter) {
      return `z.union([
    z
      .object({
        from: z.union([z.string(), z.date()]).optional(),
        to: z.union([z.string(), z.date()]).optional(),
      })
      .strict(),
    z.string(),
    z.date(),
  ])`;
    }
    return 'z.union([z.string(), z.date()])';
  }
  const required = mode === 'update' || mode === 'filter' ? false : Boolean(field.required);
  let expr = 'z.string()';
  if (!field.isArray && field.format === 'email') expr += zodRegex(EMAIL_PATTERN);
  if (constraints?.minLength != null) expr += `.min(${constraints.minLength})`;
  else if (required) expr += '.min(1)';
  if (constraints?.maxLength != null) expr += `.max(${constraints.maxLength})`;
  if (constraints?.pattern) expr += zodRegex(constraints.pattern);
  return expr;
}

/** Full Zod field expression including array + optional. */
export function emitZodFieldExpr(
  field: TemplateField & Record<string, unknown>,
  mode: 'create' | 'update' | 'filter' | 'base'
): string {
  const required = mode === 'update' || mode === 'filter' ? false : Boolean(field.required);
  const inner = emitZodInner(field, mode);
  const base = field.isArray ? `z.array(${inner})` : inner;
  // Update: `null` clears an optional single field (`$unset`), a required one or an array rejects it (contract §5).
  const acceptsNull = mode === 'update' ? updateNullClears(field) : field.nullable === true && mode !== 'filter';
  const expr = acceptsNull ? `${base}.nullable()` : base;
  // Create: an omitted field takes the model default (Mongoose would apply it too), so it is not required.
  const def = field.schemaDefault;
  if (mode === 'create' && def !== undefined && def !== null && !field.isArray) {
    return `${expr}.default(${typeof def === 'string' ? tsStringLiteral(def) : String(def)})`;
  }
  return required ? expr : `${expr}.optional()`;
}


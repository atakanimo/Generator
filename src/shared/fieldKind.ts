/**
 * Field-kind classifier + Zod emit helpers for the BE templates.
 * Prefer this over scattered `if (type === …)` in templates/helpers.
 */

import {
  enumValuesOf,
  tsStringLiteral,
  emitObjectZodLiteral,
  type TemplateField
} from './schemaFieldTypes.js';
import { kindFromTypeToken } from './fieldTypeToken.js';

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

/** Inner Zod expression (no optional / array wrapper). */
export function emitZodInner(field: TemplateField & Record<string, unknown>, mode: 'create' | 'update' | 'filter' | 'base'): string {
  const { kind } = classifyField(field);
  const t = typeToken(field);

  if (kind === 'map') {
    return 'z.record(z.string(), z.number())';
  }
  if (kind === 'decimal') {
    return 'z.union([z.number(), z.string()])';
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
  if (t === 'number') return 'z.number()';
  if (t === 'boolean') return 'z.boolean()';
  if (t === 'date') {
    if (mode === 'filter' && String((field as { filterType?: string }).filterType || '').toLowerCase() === 'date-range') {
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
  return required ? "z.string().min(1)" : 'z.string()';
}

/** Full Zod field expression including array + optional. */
export function emitZodFieldExpr(
  field: TemplateField & Record<string, unknown>,
  mode: 'create' | 'update' | 'filter' | 'base'
): string {
  const required = mode === 'update' || mode === 'filter' ? false : Boolean(field.required);
  const inner = emitZodInner(field, mode);
  const base = field.isArray ? `z.array(${inner})` : inner;
  const expr = field.nullable === true && mode !== 'filter' ? `${base}.nullable()` : base;
  // Create: an omitted field takes the model default (Mongoose would apply it too), so it is not required.
  const def = field.schemaDefault;
  if (mode === 'create' && def !== undefined && def !== null && !field.isArray) {
    return `${expr}.default(${typeof def === 'string' ? tsStringLiteral(def) : String(def)})`;
  }
  return required ? expr : `${expr}.optional()`;
}


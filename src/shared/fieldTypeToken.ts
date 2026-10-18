/**
 * Type / filter tokens of a NormalizedModel v2 field: the parser's type string (`string`, `schema`,
 * `schema.types.decimal128`, …) and the Generator UI filter names (`exact`, `objectId`, …).
 *
 * The Mongoose parser, the template views (`BeField`, `FeTemplateField`) and the schema designer's "DB type"
 * column speak these tokens; the model itself stores `kind` + `native.type` (see `normalizedModel.ts`).
 */
import type { FieldKind, FilterType, NormalizedFilter } from './normalizedModel.js';

/** Canonical token per kind; anything else is kept in `native.type`. */
const KIND_TOKEN: Record<FieldKind, string> = {
  string: 'string',
  number: 'number',
  decimal: 'decimal',
  boolean: 'boolean',
  date: 'date',
  enum: 'string',
  reference: 'schema',
  object: 'object',
  map: 'map',
  json: 'mixed',
  unknown: ''
};

export function kindFromTypeToken(raw: string): FieldKind {
  const lower = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (raw === 'schema' || lower === 'objectid') return 'reference';
  if (lower.includes('mixed')) return 'json';
  if (lower.includes('decimal')) return 'decimal';
  switch (lower) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'date':
    case 'object':
    case 'map':
      return lower as FieldKind;
    default:
      return 'unknown';
  }
}

/** Type token of a v2 field / sub-field (inverse of `kindFromTypeToken` + `native`). */
export function typeTokenOf(field: { kind: FieldKind; native?: { type?: string } }): string {
  return field.native?.type ?? KIND_TOKEN[field.kind];
}

/** Scalar type token the Handlebars field views use (BE and FE templates): reference → `schema`. */
export type TemplateScalarToken = 'string' | 'number' | 'boolean' | 'date' | 'schema';

export function templateScalarToken(kind: FieldKind): TemplateScalarToken {
  switch (kind) {
    case 'number':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'reference':
      return 'schema';
    default:
      return 'string';
  }
}

/** `native.type` for a token: absent when the token is the canonical spelling for `kind`. */
export function nativeTypeFor(kind: FieldKind, raw: string): { type: string } | undefined {
  return raw === KIND_TOKEN[kind] ? undefined : { type: raw };
}

/** Generator UI filter names, in UI order. */
export const FILTER_TOKENS = ['regex', 'exact', 'objectId', 'range', 'boolean', 'date-range'] as const;
export type FilterToken = (typeof FILTER_TOKENS)[number];

const FILTER_FROM_TOKEN: Record<string, FilterType> = {
  regex: 'regex',
  exact: 'eq',
  objectId: 'reference',
  range: 'range',
  boolean: 'boolean',
  'date-range': 'date-range'
};

const FILTER_TO_TOKEN: Record<FilterType, string> = {
  regex: 'regex',
  eq: 'exact',
  reference: 'objectId',
  range: 'range',
  boolean: 'boolean',
  'date-range': 'date-range',
  // No UI name; enum filters arrive with P3 and do not round-trip to v1.
  enum: 'exact'
};

/** Filter token of a v2 field (inverse of `filterFromToken`). */
export function filterTokenOf(filter: NormalizedFilter | undefined): string | undefined {
  if (!filter) return undefined;
  if (filter.nativeType !== undefined) return filter.nativeType;
  return filter.type ? FILTER_TO_TOKEN[filter.type] : undefined;
}

/** `type` / `nativeType` of a v2 filter for a token (unknown tokens are kept in `nativeType`). */
export function filterFromToken(token: string | undefined): Pick<NormalizedFilter, 'type' | 'nativeType'> {
  return {
    type: token !== undefined ? FILTER_FROM_TOKEN[token] : undefined,
    nativeType: token !== undefined && !(token in FILTER_FROM_TOKEN) ? token : undefined
  };
}

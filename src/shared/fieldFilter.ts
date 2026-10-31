/**
 * List filter of a field: the one rule every path uses (schema designer defaults, model merge, .NET / Python / Express
 * emitters, admin config, client types). Generating from the manifest must not depend on which path loaded the model.
 */
import type { FieldKind, FilterType, NormalizedField } from './normalizedModel.js';

/** Filters a kind accepts; the first one is the default when the model names none (or one that does not fit). */
const FILTERS_BY_KIND: Partial<Record<FieldKind, readonly FilterType[]>> = {
  string: ['regex', 'eq'],
  number: ['eq', 'range'],
  decimal: ['eq', 'range'],
  boolean: ['boolean'],
  date: ['date-range'],
  enum: ['enum'],
  reference: ['reference']
};

/** Filters `kind` accepts (empty: the kind is not filterable). */
export function filtersForKind(kind: FieldKind): readonly FilterType[] {
  return FILTERS_BY_KIND[kind] ?? [];
}

/** Filter type when the model names none. */
export function defaultFilterType(kind: FieldKind): FilterType | undefined {
  return filtersForKind(kind)[0];
}

/**
 * Filter type actually applied: the model's choice when it fits the kind, otherwise the kind's default. Enum: always
 * `enum` (`IN`, one value or an array; contract §3); reference: always by id. `undefined`: the kind has no filter.
 */
export function effectiveFilterType(field: Pick<NormalizedField, 'kind' | 'filter'>): FilterType | undefined {
  const allowed = filtersForKind(field.kind);
  const wanted = field.filter?.type;
  return wanted && allowed.includes(wanted) ? wanted : allowed[0];
}

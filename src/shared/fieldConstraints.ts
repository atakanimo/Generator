/**
 * Shared request-limit and format helpers (NormalizedModel `constraints` / `format` / `dateFormat` / `enum.numbers`).
 * Every emitter and the model editor read limits through `constraintsForField`, so the rules live in one place.
 */
import type { FieldConstraints, FieldKind, NormalizedEnum } from './normalizedModel.js';

/** Practical email check (local @ domain . tld). Not the full RFC. Same pattern in BE schemas and Mongoose `match`. */
export const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

/** `dateFormat: 'date'` wire / storage form: `YYYY-MM-DD`. */
export const DATE_ONLY_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

/** JS source of `new RegExp("…")` for a pattern taken from the model. */
export function jsRegExpSource(pattern: string): string {
  return `new RegExp(${JSON.stringify(pattern)})`;
}

/**
 * The limits that apply to this field (see `FieldConstraints`): text limits on single strings, bounds on single
 * numbers / decimals, nothing on arrays or other kinds. A stale `minLength` must not follow a field that became a number.
 */
export function constraintsForField(
  field: { kind: FieldKind; isArray?: boolean; enum?: NormalizedEnum },
  constraints: FieldConstraints | undefined
): FieldConstraints | undefined {
  if (!constraints || field.isArray) return undefined;
  const out: FieldConstraints = {};
  if (field.kind === 'string' && !field.enum?.values.length) {
    if (constraints.minLength !== undefined) out.minLength = constraints.minLength;
    if (constraints.maxLength !== undefined) out.maxLength = constraints.maxLength;
    if (constraints.pattern?.trim()) out.pattern = constraints.pattern.trim();
  }
  if (field.kind === 'number' || field.kind === 'decimal') {
    if (constraints.min !== undefined) out.min = constraints.min;
    if (constraints.max !== undefined) out.max = constraints.max;
  }
  return Object.keys(out).length ? out : undefined;
}

/** `numbers` kept only when it pairs with `values` one to one; otherwise the enum is a string enum. */
export function isNumericEnum(enumDef: NormalizedEnum | undefined): enumDef is NormalizedEnum & { numbers: number[] } {
  return Boolean(enumDef?.numbers && enumDef.numbers.length > 0 && enumDef.numbers.length === enumDef.values.length);
}

/**
 * Numbers for `count` labels: existing numbers stay with their position, added labels get the next free number.
 * Used when the editor turns an enum numeric or adds / removes labels.
 */
export function syncEnumNumbers(numbers: readonly number[] | undefined, count: number): number[] {
  const out = (numbers ?? []).slice(0, count);
  let next = out.length ? Math.max(...out) + 1 : 0;
  while (out.length < count) out.push(next++);
  return out;
}

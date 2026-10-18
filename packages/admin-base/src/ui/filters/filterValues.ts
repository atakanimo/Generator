import dayjs from 'dayjs';
import type { FieldConfig } from '../../schema/fields.js';
import { relationId } from '../../schema/relation.js';
import { isEmptyValue, isRecord } from '../format.js';

export type FilterDraft = Record<string, unknown>;

function toNumber(value: unknown): number | undefined {
  if (isEmptyValue(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toDay(value: unknown): string | undefined {
  if (isEmptyValue(value)) return undefined;
  const d = dayjs(value as string);
  return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
}

function filterValue(field: FieldConfig, raw: unknown): unknown {
  switch (field.filter) {
    case 'regex':
      return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
    case 'boolean':
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
    case 'enum':
      return isEmptyValue(raw) ? undefined : raw;
    case 'relation':
      return isEmptyValue(raw) ? undefined : relationId(raw);
    case 'range': {
      if (!isRecord(raw)) return undefined;
      const min = toNumber(raw.min);
      const max = toNumber(raw.max);
      if (min === undefined && max === undefined) return undefined;
      return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    }
    case 'date-range': {
      if (!isRecord(raw)) return undefined;
      const from = toDay(raw.from);
      const to = toDay(raw.to);
      if (from === undefined && to === undefined) return undefined;
      return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
    }
    default: {
      if (field.kind === 'number' || field.kind === 'decimal') {
        const n = toNumber(raw);
        return n === undefined ? undefined : field.kind === 'decimal' ? String(raw).trim() : n;
      }
      return typeof raw === 'string' ? (raw.trim() || undefined) : isEmptyValue(raw) ? undefined : raw;
    }
  }
}

/** Taslak filtre değerlerinden sözleşmedeki `ListBody.filters`'ı üretir (§3); boşlar düşer. */
export function buildListFilters(fields: readonly FieldConfig[], draft: FilterDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const id = typeof draft.id === 'string' ? draft.id.trim() : '';
  if (id) out.id = id;
  for (const field of fields) {
    if (!field.filter) continue;
    const value = filterValue(field, draft[field.name]);
    if (value !== undefined) out[field.name] = value;
  }
  return out;
}

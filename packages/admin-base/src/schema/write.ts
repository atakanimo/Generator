import type { FieldConfig } from './fields.js';
import { relationId } from './relation.js';

export type WriteMode = 'create' | 'update';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Alt objede şemada olmayan anahtarlar (config'te modellenmemiş iç içe alan): okunan değer olduğu gibi geri gider.
 * Alt obje BE'de bütün olarak yazılır; düşürülürse kaydetmek o alanı siler. Üst seviye strict kalır. */
export function unmodelledKeys(fields: readonly FieldConfig[], value: Record<string, unknown>): Record<string, unknown> {
  const known = new Set(fields.map(f => f.name));
  return Object.fromEntries(Object.entries(value).filter(([k]) => !known.has(k) && k !== 'id'));
}

function toWriteValue(field: FieldConfig, value: unknown, mode: WriteMode): unknown {
  if (value === null || value === undefined) return value;
  if (field.kind === 'relation') {
    return Array.isArray(value) ? value.map(relationId) : relationId(value);
  }
  if (field.kind === 'object') {
    const one = (v: unknown) =>
      isRecord(v) ? { ...unmodelledKeys(field.fields, v), ...toWriteBody(field.fields, v, mode) } : v;
    return Array.isArray(value) ? value.map(one) : one(value);
  }
  return value;
}

/**
 * Create / update body'si (sözleşme §5): yalnızca şemadaki yazılabilir alanlar kalır,
 * ilişkiler id'ye indirilir. `id`, `createdAt` gibi şema dışı anahtarlar düşer (BE strict).
 * Update kısmi olduğu için `data`'da olmayan alan gönderilmez.
 */
export function toWriteBody(
  fields: readonly FieldConfig[],
  data: Record<string, unknown>,
  mode: WriteMode
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.name in data)) continue;
    if (field.readonly) continue;
    if (mode === 'create' ? field.hideOnCreate : field.hideOnUpdate) continue;
    out[field.name] = toWriteValue(field, data[field.name], mode);
  }
  return out;
}

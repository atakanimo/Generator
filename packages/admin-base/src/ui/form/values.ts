import type { DynamicDefault, FieldConfig } from '../../schema/fields.js';
import { toWriteBody, type WriteMode } from '../../schema/write.js';
import { isEmptyValue, isRecord } from '../format.js';

export type FormMode = 'create' | 'edit';

export function writeModeOf(mode: FormMode): WriteMode {
  return mode === 'edit' ? 'update' : 'create';
}

/** Create'te `hideOnCreate` ve `readonly` gizli; edit'te `hideOnUpdate` gizli, `readonly` disabled. */
export function isFieldVisible(field: FieldConfig, mode: FormMode): boolean {
  return mode === 'create' ? !field.hideOnCreate && !field.readonly : !field.hideOnUpdate;
}

function emptyValue(field: FieldConfig): unknown {
  if (field.isArray) return [];
  switch (field.kind) {
    case 'object':
      return initialFormValues(field.fields, 'create');
    case 'map':
      return {};
    case 'boolean':
      return false;
    case 'relation':
    case 'datetime':
      return null;
    case 'json':
      return '';
    default:
      return '';
  }
}

/** Dinamik varsayılanların girdisi (`AtaAdminProvider`'dan). */
export interface FormDefaultsContext {
  getCurrentUserId?: () => string | null | undefined;
}

function isDynamicDefault(value: unknown): value is DynamicDefault {
  return isRecord(value) && typeof value.dynamic === 'string';
}

function resolveDefault(field: FieldConfig, ctx: FormDefaultsContext): unknown {
  const value = field.default;
  if (!isDynamicDefault(value)) return value;
  switch (value.dynamic) {
    case 'now':
      return new Date().toISOString();
    case 'uuid':
      return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '';
    case 'currentUserId':
      return ctx.getCurrentUserId?.() ?? emptyValue(field);
  }
}

/** Form başlangıç değerleri: create'te `default` (sabit ya da dinamik) / boş değer, edit'te satır verisi. */
export function initialFormValues(
  fields: readonly FieldConfig[],
  mode: FormMode,
  row?: Record<string, unknown>,
  ctx: FormDefaultsContext = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const fromRow = row?.[field.name];
    if (mode === 'edit' && fromRow !== undefined && fromRow !== null) {
      if (field.kind === 'object' && !field.isArray && isRecord(fromRow)) {
        out[field.name] = initialFormValues(field.fields, 'edit', fromRow, ctx);
      } else if (field.kind === 'json') {
        // JSON alanı formda metin olarak düzenlenir; gönderirken parse edilir.
        out[field.name] = JSON.stringify(fromRow, null, 2);
      } else {
        out[field.name] = fromRow;
      }
      continue;
    }
    if (mode === 'create' && field.default !== undefined) {
      const initial = resolveDefault(field, ctx);
      out[field.name] = field.kind === 'json' && initial != null ? JSON.stringify(initial, null, 2) : initial;
      continue;
    }
    out[field.name] = emptyValue(field);
  }
  return out;
}

const OMIT = Symbol('omit');

/** `12,5` → `12.5` (K5: decimal JSON'da string). */
function normalizeDecimal(value: unknown): string {
  return String(value).trim().replace(',', '.');
}

function cleanValue(field: FieldConfig, value: unknown): unknown {
  if (isEmptyValue(value) && !Array.isArray(value)) return field.nullable ? null : OMIT;
  switch (field.kind) {
    case 'number':
      if (field.isArray) return (value as unknown[]).map(Number).filter(Number.isFinite);
      return Number.isFinite(Number(value)) ? Number(value) : OMIT;
    case 'decimal':
      return field.isArray ? (value as unknown[]).map(normalizeDecimal) : normalizeDecimal(value);
    case 'object':
      if (field.isArray) return (value as unknown[]).map(item => (isRecord(item) ? cleanFields(field.fields, item) : item));
      return isRecord(value) ? cleanFields(field.fields, value) : value;
    case 'json':
      return typeof value === 'string' ? JSON.parse(value) : value;
    case 'map':
      if (!isRecord(value)) return value;
      if (field.valueKind !== 'number') return value;
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Number(v)]));
    default:
      return value;
  }
}

function cleanFields(fields: readonly FieldConfig[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.name in values)) continue;
    const cleaned = cleanValue(field, values[field.name]);
    if (cleaned !== OMIT) out[field.name] = cleaned;
  }
  return out;
}

/**
 * Form değerleri → create / update body'si. Edit'te tüm form gönderilir (karar 16.10.2026);
 * boş değerler nullable alanda `null`, değilse hiç gönderilmez. Son adım `toWriteBody`.
 */
export function formValuesToBody(
  fields: readonly FieldConfig[],
  values: Record<string, unknown>,
  mode: FormMode
): Record<string, unknown> {
  return toWriteBody(fields, cleanFields(fields, values), writeModeOf(mode));
}

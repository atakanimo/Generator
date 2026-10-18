import dayjs from 'dayjs';

export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatDateTime(value: unknown): string {
  if (isEmptyValue(value)) return '';
  const d = dayjs(value as string);
  return d.isValid() ? d.format('DD.MM.YYYY HH:mm') : String(value);
}

/** Tablo hücresi için tek satırlık JSON önizlemesi. */
export function jsonPreview(value: unknown, max = 60): string {
  const raw = JSON.stringify(value);
  if (raw === undefined) return '';
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

function scalarPreview(value: unknown): string {
  if (value === null || value === undefined) return '–';
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return '{…}';
  return String(value);
}

/** Obje için ilk birkaç `alan: değer`; iç içe değerler `{…}` / `[n]`. */
export function objectSummary(value: Record<string, unknown>, maxFields = 3): string {
  const entries = Object.entries(value).filter(([, v]) => !isEmptyValue(v));
  if (entries.length === 0) return '{}';
  const head = entries.slice(0, maxFields).map(([k, v]) => `${k}: ${scalarPreview(v)}`).join(', ');
  return entries.length > maxFields ? `${head}, …` : head;
}

/** Tablo hücresi için okunur özet: obje → `alan: değer, …`; dizi → `{count}` + ilk öğenin özeti. */
export function valueSummary(value: unknown, itemCountLabel: (count: number) => string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return itemCountLabel(0);
    const first = isRecord(value[0]) ? objectSummary(value[0], 2) : scalarPreview(value[0]);
    return `${itemCountLabel(value.length)} · ${first}`;
  }
  if (isRecord(value)) return objectSummary(value);
  return jsonPreview(value);
}

/** Uzun id'ler: `65f1a2…9c4e`. */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

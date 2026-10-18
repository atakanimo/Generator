/**
 * Shared pieces of the generated `build<Entity>FilterQuery` functions (`<module>.filters.ts`).
 * Values are already validated by the module's Zod filter schema (contract §3).
 */

export type DateFilterValue = string | Date | { from?: string | Date; to?: string | Date } | null | undefined;

/** `null` / `undefined` / blank string mean "no filter". */
export function hasFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== 'string' || value.trim() !== '';
}

/** Case-insensitive "contains" match; the input is escaped, so it is never run as a pattern. */
export function regexFilter(value: unknown): { $regex: string; $options: 'i' } {
  return { $regex: String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
}

/** `{ min, max }` → `{ $gte, $lte }`; a plain value matches exactly. */
export function numberRangeFilter(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const { min, max } = value as { min?: unknown; max?: unknown };
  const query: Record<string, number> = {};
  if (typeof min === 'number') query.$gte = min;
  if (typeof max === 'number') query.$lte = max;
  return Object.keys(query).length > 0 ? query : undefined;
}

/** ISO `YYYY-MM-DD` is read as a UTC calendar day; other strings / Dates as timestamps. */
function parseDate(value: string | Date | undefined): Date | null {
  if (value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const DAY_MS = 86_400_000;

/**
 * Whole UTC days: `{ from, to }` (either may be missing) → `{ $gte: from day start, $lt: day after to }`;
 * a single value → that one day. `undefined` when nothing usable was sent.
 */
export function dateRangeFilter(value: DateFilterValue): { $gte?: Date; $lt?: Date } | undefined {
  if (value === undefined || value === null) return undefined;
  const isRange = typeof value === 'object' && !(value instanceof Date);
  const from = parseDate(isRange ? value.from : value);
  const to = parseDate(isRange ? value.to : value);
  const query: { $gte?: Date; $lt?: Date } = {};
  if (from) query.$gte = utcDayStart(from);
  if (to) query.$lt = new Date(utcDayStart(to).getTime() + DAY_MS);
  return query.$gte || query.$lt ? query : undefined;
}

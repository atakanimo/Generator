/**
 * Update payload → Mongo update (contract §5, JSON Merge Patch): an omitted field is unchanged, `null` clears the
 * field (`$unset`; the row then has no such field, which the client reads as `null`). The schema decides which
 * fields may be `null` (required fields and arrays reject it).
 */
export function toMergePatch(payload: Record<string, unknown>): { $set: Record<string, unknown>; $unset?: Record<string, ''> } {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null) $unset[key] = '';
    else if (value !== undefined) $set[key] = value;
  }
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}

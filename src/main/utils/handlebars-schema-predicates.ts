/**
 * Pure schema predicates shared by Handlebars helpers and TS emitters.
 * Single source of truth — avoid duplicating these checks across files.
 */

export function fieldsHaveSearchable(fields: unknown): boolean {
  return (
    Array.isArray(fields) &&
    (fields as { isSearchable?: boolean }[]).some(f => f?.isSearchable === true)
  );
}

export function hasSearchableRelationFields(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return (fields as { isSearchable?: boolean; includeRelation?: boolean; relationEntityName?: unknown }[]).some(
    f => f && f.isSearchable === true && f.includeRelation === true && f.relationEntityName
  );
}

export function uppercaseFirstStr(str: unknown): string {
  const s = String(str ?? '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

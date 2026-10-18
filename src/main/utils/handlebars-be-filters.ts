import Handlebars from 'handlebars';

/**
 * BE `filters.hbs` query blocks (plan 5 P4 #20) — the per-`filterType` chain lives here, not in the template
 * (`.cursor/rules/handlebars-templates.mdc`). Contract §3: list filters arrive nested under `filters`;
 * `id` is built into the template (→ `_id`), so fields named `_id` / `id` are skipped here.
 */

type FilterField = {
  name?: string;
  isSearchable?: boolean;
  filterType?: string;
  fieldDbType?: string;
};

/** One field's filter lines; values are already validated by the Zod filter schema. */
function block(name: string, filterType: string): string {
  const v = `filters.${name}`;
  switch (filterType) {
    case 'objectId':
      return `  if (hasFilterValue(${v})) query.${name} = new Types.ObjectId(String(${v}));\n`;
    case 'regex':
      return `  if (hasFilterValue(${v})) query.${name} = regexFilter(${v});\n`;
    case 'enum':
      return `  if (hasFilterValue(${v})) query.${name} = Array.isArray(${v}) ? { $in: ${v} } : ${v};\n`;
    case 'range':
    case 'date-range': {
      const fn = filterType === 'range' ? 'numberRangeFilter' : 'dateRangeFilter';
      return `  const ${name}Filter = ${fn}(${v});\n  if (${name}Filter !== undefined) query.${name} = ${name}Filter;\n`;
    }
    default:
      return `  if (hasFilterValue(${v})) query.${name} = ${v};\n`;
  }
}

/** All field filter blocks of `build<Entity>FilterQuery`, in field order. */
export function emitBeFilterQueryBlocks(fields: unknown): string {
  if (!Array.isArray(fields)) return '';
  let out = '';
  for (const raw of fields as FilterField[]) {
    const name = String(raw?.name ?? '').trim();
    if (!name || name === '_id' || name === 'id' || raw.isSearchable !== true) continue;
    out += block(name, String(raw.filterType ?? ''));
  }
  return out;
}

/** Names the blocks use from `@core/filters/filter-query.helper` (`hasFilterValue` is always used for `id`). */
export function beFilterHelperImports(fields: unknown): string {
  const used = new Set(['hasFilterValue']);
  for (const raw of Array.isArray(fields) ? (fields as FilterField[]) : []) {
    if (raw?.isSearchable !== true) continue;
    if (raw.filterType === 'regex') used.add('regexFilter');
    if (raw.filterType === 'range') used.add('numberRangeFilter');
    if (raw.filterType === 'date-range') used.add('dateRangeFilter');
  }
  return [...used].sort().join(', ');
}

export function registerBeFilterHelpers(): void {
  Handlebars.registerHelper('beFilterHelperImports', (fields: unknown) => beFilterHelperImports(fields));
  Handlebars.registerHelper('beFilterQueryBlocks', (fields: unknown) => {
    const out = emitBeFilterQueryBlocks(fields);
    return out ? new Handlebars.SafeString(out) : '';
  });
}

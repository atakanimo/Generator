import Handlebars from 'handlebars';
import { fieldsHaveSearchable } from './handlebars-schema-predicates.js';

/**
 * API base + entity segment + rest path (`admin/get-all`, `get-all`, `admin`, …).
 * Empty base → leading `/` (relative to host).
 */
export function joinFeServiceApiPath(
  baseUrl: unknown,
  entityLower: unknown,
  restSegments: unknown
): string {
  const el = String(entityLower ?? '').trim();
  const rest = String(restSegments ?? '').trim().replace(/^\/+|\/+$/g, '');
  const b =
    baseUrl != null && String(baseUrl).trim() !== '' ? String(baseUrl).trim().replace(/\/+$/, '') : '';
  const mid = rest ? `${el}/${rest}` : el;
  return b ? `${b}/${mid}` : `/${mid}`;
}

/**
 * FE `service.hbs` / `service.admin.hbs`: URL strings + GetQuery export without `#if baseUrl` / `#if hasSearchableFields`.
 * Must run after `feFilterQueryPropLine` is registered (uses it at render time).
 */
export function registerFeServiceClientHelpers(): void {
  Handlebars.registerHelper(
    'feJoinedApiUrl',
    (baseUrl: unknown, entityLower: unknown, restSegments: unknown) =>
      new Handlebars.SafeString(joinFeServiceApiPath(baseUrl, entityLower, restSegments))
  );

  Handlebars.registerHelper(
    'feServiceGetQueryInterfaceExport',
    (entityName: unknown, fields: unknown, isProtectedRoute: unknown, documentBlock: unknown) => {
      if (!fieldsHaveSearchable(fields)) return '';
      const en = String(entityName ?? '');
      const propFn = Handlebars.helpers.feFilterQueryPropLine as (
        field: unknown,
        route?: unknown
      ) => Handlebars.SafeString | string | undefined;
      let lines = '';
      for (const f of fields as unknown[]) {
        const chunk = propFn(f, isProtectedRoute);
        if (chunk) lines += String(chunk);
      }
      const includeDoc =
        documentBlock === true ||
        documentBlock === 'withDoc' ||
        String(documentBlock ?? '') === 'true';
      const doc = includeDoc
        ? `/**\n * ${en} Query DTO (Data Transfer Object)\n * Used for filtering/searching ${en} records\n * Only includes fields marked as searchable\n */\n`
        : '';
      return new Handlebars.SafeString(`${doc}export interface Get${en}Query {\n${lines}}\n`);
    }
  );

  Handlebars.registerHelper('feServiceGetQueryListBodyTypeLine', (entityName: unknown, fields: unknown) => {
    const en = String(entityName ?? '');
    const searchable = fieldsHaveSearchable(fields);
    const q = searchable ? `Get${en}Query & ` : '';
    return new Handlebars.SafeString(`export type Get${en}ListBody = ${q}ListPaginationBody;`);
  });

  /** Thunk types import: append `, Get*Query` only when list filters exist. */
  Handlebars.registerHelper('feThunkOptionalGetQueryImport', (entityName: unknown, fields: unknown) => {
    const en = String(entityName ?? '');
    return fieldsHaveSearchable(fields)
      ? new Handlebars.SafeString(`, Get${en}Query`)
      : new Handlebars.SafeString('');
  });
}

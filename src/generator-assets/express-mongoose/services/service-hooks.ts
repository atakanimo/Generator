import type { IApiResponse } from '@core/types/api-contract';
import { HandleServiceError } from '@core/errors/error.helper';

/**
 * Hook contract of the generated services — the same set on every Generator backend (Express, .NET, Python).
 * A module's `<module>.hooks.ts` fills only what it needs.
 *
 * - `before*` returning an error response stops the operation; that response is sent to the client.
 * - `after*` runs after the write is stored and cannot undo it: a throw becomes an error response, the record stays.
 *   Consistency checks belong in `before*`.
 * - `mapRows` changes the rows of a list / getOne response, all rows of a page in one call (batch IO, no N+1).
 *
 * Rows are DB records before `toWire` (`_id`, not `id`): lean objects, or Mongoose documents in a module that reads
 * with `lean: false`.
 */
export type HookRow = Record<string, unknown>;

type Gate = Promise<IApiResponse<unknown> | undefined> | IApiResponse<unknown> | undefined;

export interface ServiceHooks<TFilters, TInput> {
  /** List sort when the request sends no `sortBy` (default `{ createdAt: -1, _id: -1 }`). */
  defaultSort?: Record<string, 1 | -1>;
  beforeList?(filters: TFilters): TFilters | Promise<TFilters>;
  beforeGetById?(id: string): Gate;
  beforeCreate?(data: TInput): Gate;
  beforeUpdate?(id: string, data: Partial<TInput>): Gate;
  beforeDelete?(id: string): Gate;
  /** The created record. */
  afterCreate?(row: HookRow): Promise<void> | void;
  /** The updated record. */
  afterUpdate?(row: HookRow): Promise<void> | void;
  /** The deleted record (cascade, cache cleanup). */
  afterDelete?(row: HookRow): Promise<void> | void;
  /** Rows of one list page, or the single getOne row. Must return the rows in the same order. */
  mapRows?(rows: HookRow[]): HookRow[] | Promise<HookRow[]>;
}

type MapRows = ServiceHooks<unknown, unknown>['mapRows'];
type AfterHook = (row: HookRow) => Promise<void> | void;

/** List response (`PaginatedList`): `mapRows` over `items`. */
export async function mapListRows<T>(response: IApiResponse<T>, mapRows: MapRows): Promise<IApiResponse<T>> {
  if (!mapRows || !response.isSuccess || response.data == null) return response;
  const page = response.data as T & { items: HookRow[] };
  return { ...response, data: { ...page, items: await mapRows(page.items) } };
}

/** getOne response: `mapRows` with the single row. */
export async function mapOneRow<T>(response: IApiResponse<T>, mapRows: MapRows): Promise<IApiResponse<T>> {
  if (!mapRows || !response.isSuccess || response.data == null) return response;
  const [row] = await mapRows([response.data as HookRow]);
  return { ...response, data: row as T };
}

/** Runs an `after*` hook on a successful write; a throw becomes the error response (the write is kept). */
export async function runAfterWrite<T>(response: IApiResponse<T>, hook: AfterHook | undefined, context: string): Promise<IApiResponse<T>> {
  if (!hook || !response.isSuccess || response.data == null) return response;
  try {
    await hook(response.data as HookRow);
    return response;
  } catch (error) {
    return HandleServiceError(error, { context });
  }
}

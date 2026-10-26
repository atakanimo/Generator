/**
 * Liste endpoint’leri: **`limit`** (üst sınır, varsayılan **50**) ve **`page`** (1 tabanlı; verilmezse **1**).
 * İç sorgu offset’i `(page - 1) * limit` ile üretilir; istek gövdesinde **`skip` yok`.
 */
import type { SortOrder } from '@core/types/api-contract';

export const DEFAULT_LIST_PAGE = 1;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

export type PaginatedList<T> = {
  items: T[];
  hasMore: boolean;
  total: number;
  currentLimit: number;
  currentPage: number;
};

/** Yanıt meta: sunucunun kullandığı limit ve o offset için sayfa numarası. */
export function paginatedListMeta(appliedSkip: number, appliedLimit: number): { currentPage: number; currentLimit: number } {
  const lim = Math.max(1, Math.floor(appliedLimit));
  const sk = Math.max(0, Math.floor(appliedSkip));
  return { currentLimit: lim, currentPage: Math.floor(sk / lim) + 1 };
}

export function clampListLimit(raw?: number): number {
  if (raw == null || Number.isNaN(raw) || raw < 1) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.min(Math.floor(raw), MAX_LIST_LIMIT);
}

export function listOffsetFromPage(page: number | undefined, limit: number): number {
  const lim = Math.max(1, Math.floor(limit));
  const p =
    page != null && Number.isFinite(page) ? Math.max(1, Math.floor(Number(page)) || 1) : DEFAULT_LIST_PAGE;
  return (p - 1) * lim;
}

/** POST `get-all` gövdesi (sözleşme K2): filtreler `filters` altında, sayfalama üst seviyede. */
export type ListPaginationBody = {
  filters?: Record<string, unknown>;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
};

export function normalizeSortOrder(raw: unknown): 1 | -1 | undefined {
  if (raw === 'asc') return 1;
  if (raw === 'desc') return -1;
  return undefined;
}

/**
 * Güvenli liste sıralama resolver:
 * - `sortBy` boş/uygunsuzsa `fallbackSort` döner
 * - `sortOrder` yoksa `fallbackSort`'taki ilk alan yönü kullanılır (yoksa `desc`)
 * - JSON'daki kimlik alanı `id`'dir (sözleşme K1); Mongo'da `_id`'ye çevrilir
 */
export function resolveListSort(
  sortBy: string | undefined,
  sortOrder: unknown,
  fallbackSort: Record<string, 1 | -1>
): Record<string, 1 | -1> {
  if (!sortBy) {
    return fallbackSort;
  }
  const trimmed = sortBy.trim();
  if (!trimmed) {
    return fallbackSort;
  }

  const normalized = normalizeSortOrder(sortOrder);
  const fallbackFirstDirection = Object.values(fallbackSort)[0] ?? -1;
  const direction = normalized ?? fallbackFirstDirection;
  return { [trimmed === 'id' ? '_id' : trimmed]: direction };
}

/**
 * `POST .../get-all` gövdesini filtre ve sayfalama olarak ayırır (sözleşme K2: `{ filters?, page?, limit?, sortBy?, sortOrder? }`).
 * Düz gövde (filtreler üst seviyede) artık desteklenmez (sert geçiş, plan 5 G1).
 */
export function extractListPagination(body: Record<string, unknown> | undefined): {
  filters: Record<string, unknown>;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
} {
  if (!body) {
    return { filters: {} };
  }
  const raw = body.filters;
  const filters: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  const { limit, page, sortBy, sortOrder } = body;
  return {
    filters,
    limit: typeof limit === 'number' && !Number.isNaN(limit) ? limit : undefined,
    page: typeof page === 'number' && !Number.isNaN(page) ? page : undefined,
    sortBy: typeof sortBy === 'string' && sortBy.trim().length > 0 ? sortBy.trim() : undefined,
    sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined
  };
}

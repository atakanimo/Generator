/**
 * Liste endpoint’leri: **`limit`** (üst sınır, varsayılan **50**) ve **`page`** (1 tabanlı; verilmezse **1**).
 * İç sorgu offset’i `(page - 1) * limit` ile üretilir; istek gövdesinde **`skip` yok`.
 */

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

/** POST `get-all` gövdesindeki sayfalama alanları (filtre dışı). */
export type ListPaginationBody = {
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const LIST_PAGINATION_KEYS = new Set(['limit', 'page', 'sortBy', 'sortOrder']);

export function normalizeSortOrder(raw: unknown): 1 | -1 | undefined {
  if (raw === 'asc') return 1;
  if (raw === 'desc') return -1;
  return undefined;
}

/**
 * Güvenli liste sıralama resolver:
 * - `sortBy` boş/uygunsuzsa `fallbackSort` döner
 * - `sortOrder` yoksa `fallbackSort`'taki ilk alan yönü kullanılır (yoksa `desc`)
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
  return { [trimmed]: direction };
}

/**
 * Gövdeden filtre vs sayfalama ayırır (tüm `POST .../get-all` şemaları).
 */
export function extractListPagination(body: Record<string, unknown> | undefined): {
  filters: Record<string, unknown>;
  limit?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} {
  if (!body) {
    return { filters: {} };
  }
  const filters: Record<string, unknown> = {};
  let limit: number | undefined;
  let page: number | undefined;
  let sortBy: string | undefined;
  let sortOrder: 'asc' | 'desc' | undefined;
  for (const [k, v] of Object.entries(body)) {
    if (!LIST_PAGINATION_KEYS.has(k)) {
      filters[k] = v;
      continue;
    }
    if (k === 'limit' && typeof v === 'number' && !Number.isNaN(v)) limit = v;
    else if (k === 'page' && typeof v === 'number' && !Number.isNaN(v)) page = v;
    else if (k === 'sortBy' && typeof v === 'string' && v.trim().length > 0) sortBy = v.trim();
    else if (k === 'sortOrder' && (v === 'asc' || v === 'desc')) sortOrder = v;
  }
  return { filters, limit, page, sortBy, sortOrder };
}

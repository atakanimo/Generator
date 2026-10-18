/**
 * HTTP API sözleşmesi — Generator `docs/api-contract.md` §1–4.
 * Bütün BE stack'leri bu şekli üretir; paket arkadaki stack'i bilmez.
 */

/** Kayıt kimliği: her stack'te JSON'da `id: string` (K1, K4). */
export type Id = string;

export interface ApiErrorData {
  header?: string;
  message: string;
  code?: number;
}

/** Host interceptor'ın resolve / reject ettiği şekil (`LocalResponse`). */
export interface ApiResponse<T> {
  isSuccess: boolean;
  data?: T | null;
  uiMessage?: string | null;
  errorData?: ApiErrorData | null;
}

export type SortOrder = 'asc' | 'desc';

/** `POST {endpoint}/get-all` body'si — filtreler iç içe (K2). */
export interface ListBody {
  filters?: Record<string, unknown>;
  /** 1 tabanlı. */
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PaginatedList<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  currentPage: number;
  currentLimit: number;
}

export interface RangeFilterValue {
  min?: number;
  max?: number;
}

export interface DateRangeFilterValue {
  from?: string;
  to?: string;
}

/** Populate edilmiş referans: `{ id, ...populate alanları }`. */
export type PopulatedRef<Fields extends string = string> = { id: Id } & { [K in Fields]?: unknown };

export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 100;
/** Autocomplete seçenek sayısı (K3). */
export const RELATION_OPTIONS_LIMIT = 20;

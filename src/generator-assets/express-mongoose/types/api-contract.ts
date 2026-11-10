/**
 * HTTP API genel yanıt sözleşmesi — `AtaResponse` / servis dönüşleri ile uyumlu.
 * CodeStandarts §2 (paylaşılan): **`src/core/types/`**, domain **`*.types.ts`** değildir.
 */
export interface IErrorData {
  header?: string;
  message: string;
  code?: number;
  field?: string;
}

export interface IApiResponse<T> {
  data?: T | null;
  isSuccess: boolean;
  uiMessage: string | null;
  errorData: IErrorData | null;
  /** İstek kimliği. Middleware doldurur; yoksa alan yazılmaz. */
  traceId?: string;
}

/** Generic ascending/descending sort order — tüm liste endpoint'lerinde ortak. */
export type SortOrder = 'asc' | 'desc';

/** Zod schema'larda `order` alanı için ortak tuple. */
export const SORT_ORDER_VALUES = ['asc', 'desc'] as const;


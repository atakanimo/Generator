// HTTP katmanının tipleri: cevap şekli, hook'lar ve oturum köprüsü.
import type { InternalAxiosRequestConfig } from 'axios';

/** `field`: hatanın ait olduğu gövde alanı; form onu alanın altında gösterir. */
export interface ErrorData {
  header: string;
  message: string;
  code: number;
  field?: string;
}

/** Başarıda resolve, hatada reject edilen tek şekil. */
export interface LocalResponse<T> {
  isSuccess: boolean;
  data: T;
  uiMessage: string;
  errorData: ErrorData | null;
  /** Ağ hatasında yok. */
  statusCode?: number;
  traceId?: string;
  /** Dosya cevabında `Content-Disposition`'daki ad. */
  fileName?: string;
}

export interface ApiHooks {
  /** `LocalResponse` dönerse istek gitmez, onunla reject olur. */
  onRequest?: (config: InternalAxiosRequestConfig) => LocalResponse<null> | void;
  onResponseHeaders?: (headers: Record<string, unknown>) => void;
  /** `true` dönerse hata mesajı gösterilmez. */
  onError?: (response: LocalResponse<null>, config?: InternalAxiosRequestConfig) => boolean | void;
}

export type ApiDispatch = (action: never) => unknown;

export interface ApiAuth {
  getAccessToken: (state: unknown) => string | null | undefined | Promise<string | null | undefined>;
  /** 401 + başarısız refresh sonrası `false` ise uçuştaki bütün istekler iptal edilir. */
  hasSession: (state: unknown) => boolean;
  /** `true` → istek bir kez tekrarlanır. `false` dönmeden önce oturumu (sunucu reddettiyse) burası kapatır. */
  refreshSessionOnce: (dispatch: ApiDispatch) => Promise<boolean>;
  /** Bu uçların 401'inde refresh denenmez. */
  isAuthRequest: (url: string | undefined) => boolean;
}

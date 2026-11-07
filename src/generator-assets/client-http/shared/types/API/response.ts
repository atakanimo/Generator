// Ortak HTTP tipleri (docs/frontend/http-layer.md). Admin, web ve mobilde birebir aynıdır; projede değiştirilmez.
// Projenin `@/types`'ı bu dosyayı re-export eder (`export * from './API/response'`).
import type { InternalAxiosRequestConfig } from 'axios';

/** Sunucu hata zarfı (api-contract §1). `field`: hatanın ait olduğu gövde alanı; form onu alanın altında gösterir. */
export interface ErrorData {
  header: string;
  message: string;
  code: number;
  field?: string;
}

/** Interceptor çıktısı (api-contract §7): başarıda resolve, hatada reject edilen tek şekil. */
export interface LocalResponse<T> {
  isSuccess: boolean;
  /** Zarfın `data`'sı. */
  data: T;
  /** Sunucunun kullanıcıya mesajı (başarı toast'u). */
  uiMessage: string;
  /** Hatada dolu, başarıda `null`. */
  errorData: ErrorData | null;
  /** HTTP statüsü; ağ hatasında yok. */
  statusCode?: number;
  /** İstek kimliği (zarfta varsa). */
  traceId?: string;
  /** Dosya cevabında `Content-Disposition`'daki ad (web). */
  fileName?: string;
}

/**
 * Projeye özel davranış: `services/api/index.ts`'e dokunmadan `services/api/hooks.ts`'ten verilir. Hepsi isteğe bağlıdır; boş hook'larla
 * api.ts sözleşmedeki varsayılan davranışı uygular.
 */
export interface ApiHooks {
  /** İstek gitmeden önce: ek header (misafir anahtarı vb.). Bir `LocalResponse` dönerse istek gitmez, onunla reject olur. */
  onRequest?: (config: InternalAxiosRequestConfig) => LocalResponse<null> | void;
  /** Her cevabın (başarı ya da hata) header'ları; ör. sunucunun döndüğü misafir anahtarını saklamak. */
  onResponseHeaders?: (headers: Record<string, unknown>) => void;
  /** Hata gösterilmeden önce: `true` dönerse hata mesajı gösterilmez (ör. paywall'a yönlendirme, sessiz statü). */
  onError?: (response: LocalResponse<null>, config?: InternalAxiosRequestConfig) => boolean | void;
}

/** Redux `dispatch`: `apiAuth` oturumu kapatırken kullanır. */
export type ApiDispatch = (action: never) => unknown;

/**
 * Oturum köprüsü (`services/api/auth.ts`, projeye özel): ortak `services/api` token'ı, refresh'i ve oturumun bitip bitmediğini
 * buradan öğrenir. Auth ortaklaşınca bu dosya üretilen auth'u bağlar; api.ts değişmez.
 */
export interface ApiAuth {
  /** İstekte gönderilecek access token (store'daki; yoksa storage). */
  getAccessToken: (state: unknown) => string | null | undefined | Promise<string | null | undefined>;
  /** Oturum açık mı: 401 + başarısız refresh sonrası `false` ise uçuştaki bütün istekler iptal edilir. */
  hasSession: (state: unknown) => boolean;
  /**
   * 401'de tek seferlik yenileme (aynı anda gelenler aynı çağrıyı bekler). `true` → istek bir kez tekrarlanır. `false` →
   * oturumu kapatmak buranın işidir (sunucu reddettiyse); ağ hatasında oturum kalır. Refresh'i olmayan proje oturumu
   * kapatıp `false` döner.
   */
  refreshSessionOnce: (dispatch: ApiDispatch) => Promise<boolean>;
  /** 401'i cevabın kendisi olan auth uçları (login, refresh, logout): refresh denenmez. */
  isAuthRequest: (url: string | undefined) => boolean;
}

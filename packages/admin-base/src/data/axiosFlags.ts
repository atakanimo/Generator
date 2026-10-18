import type { AxiosRequestConfig } from 'axios';

/**
 * Host interceptor'ın uyduğu istek bayrakları (sözleşme §7).
 * Header değil, axios config alanıdır; sunucuya gitmez.
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    /** true → host global loading'i açmaz (autocomplete, arka plan istekleri). */
    skipLoading?: boolean;
    /** true → host başarı toast'unu göstermez (okuma istekleri). */
    skipSuccessToast?: boolean;
  }
}

export type AtaRequestFlags = Pick<AxiosRequestConfig, 'skipLoading' | 'skipSuccessToast'>;

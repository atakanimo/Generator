import { QueryClient } from '@tanstack/react-query';

/**
 * Host interceptor ile uyumlu varsayılanlar (sözleşme §7):
 * - `retry: false` — her deneme interceptor'da ayrı hata toast'u demek.
 * - `refetchOnWindowFocus: false` — sekme değişiminde global loading yanıp sönmesin.
 */
export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false }
    }
  });
}

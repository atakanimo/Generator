// Ortak HTTP katmanı (docs/frontend/http-layer.md, api-contract §7): projede değiştirilmez. Platform farkı `./platform.ts`,
// oturum (token, refresh) `./auth.ts`, projeye özel davranış `./hooks.ts`'te.
// Tek axios örneği: token, dil, global loading, başarı / hata mesajı, dosya, 401 → refresh. Thunk, slice ve sayfa bunları
// tekrarlamaz.
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import i18n from 'i18next';
import { setCommonLoading } from '@/store/slices/common.slice';
import type { ErrorData, LocalResponse } from '@/types';
import { getAccessToken, hasSession, isAuthRequest, refreshSessionOnce } from './auth';
import { BASE_URL, showErrorMessage, showSuccessMessage } from './platform';
import { apiHooks } from './hooks';

// İstek bayrakları: axios config alanıdır, header değil; sunucuya gitmez (contract §7.7).
declare module 'axios' {
  interface AxiosRequestConfig {
    /** Arka plan / sayfalama isteği: global loading yok. */
    skipLoading?: boolean;
    /** Başarı mesajı (`uiMessage`) yok. Üretilmiş okumalar varsayılan olarak kapatır. */
    skipSuccessToast?: boolean;
    /** Hata mesajı yok: hatayı ekran kendisi gösterir (ör. alan altı uyarı). */
    skipErrorToast?: boolean;
  }
}

/** Sunucu zarfı (api-contract §1). */
type ApiEnvelope = {
  isSuccess?: boolean;
  data?: unknown;
  uiMessage?: string | null;
  traceId?: string;
  errorData?: Partial<ErrorData> | null;
};

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean; _abort?: AbortController };

/** Store yalnız loading'i dispatch etmek ve state'i `./auth`'a vermek için; döngü olmasın diye sonradan enjekte edilir. */
type ApiStore = { getState(): unknown; dispatch(action: never): unknown };
let store: ApiStore | null = null;

export const injectStore = (appStore: ApiStore) => {
  store = appStore;
};

export const API = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

const dispatch = (action: unknown) => store?.dispatch(action as never);

// ---- loading ve iptal ----

// Global loading yalnız burada açılır / kapanır; uygulama yalnız okur.
let activeRequests = 0;

function startLoading(config: InternalAxiosRequestConfig) {
  if (config.skipLoading) return;
  activeRequests += 1;
  if (activeRequests === 1) dispatch(setCommonLoading(true));
}

/** Uçuştaki istekler: oturum biterse hepsi iptal edilir. */
const inFlight = new Set<AbortController>();

/** Her isteğe bir controller; çağıranın kendi sinyali (ör. autocomplete) varsa ona da bağlanır. */
function trackRequest(config: RetryConfig) {
  const controller = new AbortController();
  const callerSignal = config.signal as AbortSignal | undefined;
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener?.('abort', () => controller.abort(), { once: true });
  config.signal = controller.signal;
  config._abort = controller;
  inFlight.add(controller);
}

function abortAll() {
  inFlight.forEach(controller => controller.abort());
  inFlight.clear();
}

/** İstek bitti (başarılı ya da değil): loading düşer, takip biter, header'lar hook'a gider. */
function settle(config: RetryConfig | undefined, headers?: unknown) {
  if (config && !config.skipLoading && activeRequests > 0) {
    activeRequests -= 1;
    if (activeRequests === 0) dispatch(setCommonLoading(false));
  }
  if (config?._abort) inFlight.delete(config._abort);
  if (headers) apiHooks.onResponseHeaders?.(headers as Record<string, unknown>);
}

const isCanceled = (error: AxiosError) => axios.isCancel(error as unknown) || Boolean(error.config?.signal?.aborted);

/** Aynı anda gelen 401'ler tek refresh'i bekler. */
let refreshing: Promise<boolean> | null = null;

/** Aynı anda düşen 401'ler oturum sonu mesajını bir kez gösterir. */
let sessionEndNotifiedAt = 0;
function shouldNotifySessionEnd() {
  const now = Date.now();
  if (now - sessionEndNotifiedAt <= 4000) return false;
  sessionEndNotifiedAt = now;
  return true;
}

// ---- zarf ----

const isBlob = (value: unknown): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob;

/** Dosya istenen uçlarda hata zarfı da Blob gelir. React Native'in Blob'unda `text()` yok (mobil dosya indirmez). */
async function readEnvelope(body: unknown): Promise<ApiEnvelope | null> {
  if (!isBlob(body)) return (body as ApiEnvelope | undefined) ?? null;
  const { text } = body as { text?: () => Promise<string> };
  if (typeof text !== 'function') return null;
  try {
    return JSON.parse(await text.call(body)) as ApiEnvelope;
  } catch {
    return null;
  }
}

const errorResponse = (errorData: ErrorData, statusCode?: number, traceId?: string): LocalResponse<null> => ({
  isSuccess: false,
  data: null,
  uiMessage: '',
  errorData,
  statusCode,
  ...(traceId && { traceId })
});

function toErrorResponse(envelope: ApiEnvelope | null, status: number | undefined): LocalResponse<null> {
  const fallback = status === undefined ? i18n.t('errors.networkError') : i18n.t('errors.general');
  return errorResponse(
    {
      code: Number(envelope?.errorData?.code ?? status ?? 0),
      header: envelope?.errorData?.header ?? '',
      message: envelope?.errorData?.message || envelope?.uiMessage || fallback,
      field: envelope?.errorData?.field ?? undefined
    },
    status,
    envelope?.traceId
  );
}

/** Hata bir kez, burada gösterilir; hook üstlendiyse ya da ekran istemediyse gösterilmez. */
function reportError(response: LocalResponse<null>, config?: InternalAxiosRequestConfig) {
  if (apiHooks.onError?.(response, config)) return;
  if (!config?.skipErrorToast && response.errorData) showErrorMessage(response.errorData);
}

/** Başarı mesajı yalnız yazma isteklerinde: GET / HEAD, `/get-all` ve `/me` hiç basmaz. */
function shouldShowSuccess(config: InternalAxiosRequestConfig): boolean {
  if (config.skipSuccessToast) return false;
  const method = (config.method ?? 'get').toLowerCase();
  if (method === 'get' || method === 'head') return false;
  const path = (config.url ?? '').split('?')[0];
  return !(path.endsWith('/get-all') || path.endsWith('/me'));
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

/** `attachment; filename*=UTF-8''a%20b.pdf` ya da `filename="a.pdf"`. */
function fileNameFromContentDisposition(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1];
  return (
    (encoded && safeDecode(encoded.trim().replace(/^"|"$/g, ''))) || /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim()
  );
}

// ---- interceptor'lar ----

const handleRequest = async (config: InternalAxiosRequestConfig) => {
  const blocked = apiHooks.onRequest?.(config);
  if (blocked) return Promise.reject(blocked);

  const token = await getAccessToken(store?.getState());
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // İstek dili yalnız `Accept-Language` (api-contract K6): kullanılan dilin kısa kodu; `tr-TR` → `tr`, desteklenmeyen
  // cihaz dili → i18next'in düştüğü dil. Çağrı kendi dilini verdiyse (ör. içeriğin dili) ona dokunulmaz.
  const lang = (i18n.resolvedLanguage || i18n.language || '').split('-')[0];
  if (lang && !config.headers.has('Accept-Language')) config.headers.set('Accept-Language', lang);

  trackRequest(config);
  startLoading(config);
  return config;
};

// Çağıran (servis) `AxiosResponse` değil `LocalResponse` alır.
const handleResponse = (axiosResponse: AxiosResponse<unknown>) => {
  const config = axiosResponse.config as RetryConfig;
  settle(config, axiosResponse.headers);

  // Dosya cevabında zarf yok (export, QR).
  if (isBlob(axiosResponse.data)) {
    const file: LocalResponse<Blob> = {
      isSuccess: true,
      data: axiosResponse.data,
      uiMessage: '',
      errorData: null,
      statusCode: axiosResponse.status,
      fileName: fileNameFromContentDisposition(axiosResponse.headers?.['content-disposition'])
    };
    return file as unknown as AxiosResponse;
  }

  const envelope = axiosResponse.data as ApiEnvelope | null;
  if (envelope?.isSuccess === false) {
    const response = toErrorResponse(envelope, axiosResponse.status);
    reportError(response, config);
    return Promise.reject(response);
  }

  const response: LocalResponse<unknown> = {
    isSuccess: true,
    data: envelope?.data ?? null,
    uiMessage: envelope?.uiMessage || '',
    errorData: null,
    statusCode: axiosResponse.status,
    ...(envelope?.traceId && { traceId: envelope.traceId })
  };
  if (response.uiMessage && shouldShowSuccess(config)) showSuccessMessage(response.uiMessage);
  return response as unknown as AxiosResponse;
};

/** `onRequest`'in durdurduğu istek buraya `LocalResponse` olarak gelir; loading başlamadı, mesajı hook bastı. */
const isLocalResponse = (value: unknown): value is LocalResponse<null> =>
  !axios.isAxiosError(value) && typeof (value as LocalResponse<null> | null)?.isSuccess === 'boolean';

const handleResponseError = async (error: AxiosError | LocalResponse<null>) => {
  if (isLocalResponse(error)) return Promise.reject(error);
  const config = error.config as RetryConfig | undefined;
  settle(config, error.response?.headers);

  // İptal edilen istek sessizdir.
  if (isCanceled(error)) return Promise.reject(errorResponse({ header: '', message: '', code: 0 }));

  const status = error.response?.status;
  const response = toErrorResponse(error.response ? await readEnvelope(error.response.data) : null, status);

  // Access token'ın süresi doldu: tek refresh (aynı anda gelen 401'ler aynı çağrıyı bekler), istek bir kez tekrar.
  // Refresh olmazsa oturumu `./auth` kapatır (ağ hatası kapatmaz); o zaman uçuştaki istekler sessizce iptal edilir ve
  // oturum sonu mesajı bir kez gösterilir.
  let sessionEnded = false;
  if (status === 401 && config && !isAuthRequest(config.url)) {
    if (!config._retried) {
      refreshing ??= refreshSessionOnce(dispatch).finally(() => {
        refreshing = null;
      });
      if (await refreshing) {
        return API({ ...config, _retried: true, signal: undefined, _abort: undefined } as InternalAxiosRequestConfig);
      }
    }
    sessionEnded = !hasSession(store?.getState());
    if (sessionEnded) abortAll();
  }

  if (!sessionEnded || shouldNotifySessionEnd()) reportError(response, config);
  return Promise.reject(response);
};

// Tek request interceptor: onRejected'ı hiç çalışmaz (`onRequest` reddi `handleResponseError`'a düşer).
API.interceptors.request.use(handleRequest);
API.interceptors.response.use(handleResponse, handleResponseError);

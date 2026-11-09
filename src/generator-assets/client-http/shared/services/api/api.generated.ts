import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import i18n from 'i18next';
import { setCommonLoading } from '@/store/slices/common.slice';
import type { ErrorData, LocalResponse } from '@/types';
import { getAccessToken, hasSession, isAuthRequest, refreshSessionOnce } from './auth.generated';
import { BASE_URL, showErrorMessage, showSuccessMessage } from './platform.generated';
import { apiHooks } from './hooks';

declare module 'axios' {
  interface AxiosRequestConfig {
    skipLoading?: boolean;
    skipSuccessToast?: boolean;
    skipErrorToast?: boolean;
  }
}

type ApiBody = {
  isSuccess?: boolean;
  data?: unknown;
  uiMessage?: string | null;
  traceId?: string;
  errorData?: Partial<ErrorData> | null;
};

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean; _abort?: AbortController };

type ApiStore = { getState(): unknown; dispatch(action: never): unknown };
let store: ApiStore | null = null;

export const injectStore = (appStore: ApiStore) => {
  store = appStore;
};

export const API = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' }
});

const dispatch = (action: unknown) => store?.dispatch(action as never);

let activeRequests = 0;

function startLoading(config: InternalAxiosRequestConfig) {
  if (config.skipLoading) return;
  activeRequests += 1;
  if (activeRequests === 1) dispatch(setCommonLoading(true));
}

const inFlight = new Set<AbortController>();

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

function settle(config: RetryConfig | undefined, headers?: unknown) {
  if (config && !config.skipLoading && activeRequests > 0) {
    activeRequests -= 1;
    if (activeRequests === 0) dispatch(setCommonLoading(false));
  }
  if (config?._abort) inFlight.delete(config._abort);
  if (headers) apiHooks.onResponseHeaders?.(headers as Record<string, unknown>);
}

const isCanceled = (error: AxiosError) => axios.isCancel(error as unknown) || Boolean(error.config?.signal?.aborted);

let refreshing: Promise<boolean> | null = null;

let sessionEndNotifiedAt = 0;
function shouldNotifySessionEnd() {
  const now = Date.now();
  if (now - sessionEndNotifiedAt <= 4000) return false;
  sessionEndNotifiedAt = now;
  return true;
}

const isBlob = (value: unknown): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob;

async function readErrorBody(body: unknown): Promise<ApiBody | null> {
  if (!isBlob(body)) return (body as ApiBody | undefined) ?? null;
  const { text } = body as { text?: () => Promise<string> };
  if (typeof text !== 'function') return null;
  try {
    return JSON.parse(await text.call(body)) as ApiBody;
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

function toErrorResponse(payload: ApiBody | null, status: number | undefined): LocalResponse<null> {
  const fallback = status === undefined ? i18n.t('errors.networkError') : i18n.t('errors.general');
  return errorResponse(
    {
      code: Number(payload?.errorData?.code ?? status ?? 0),
      header: payload?.errorData?.header ?? '',
      message: payload?.errorData?.message || payload?.uiMessage || fallback,
      field: payload?.errorData?.field ?? undefined
    },
    status,
    payload?.traceId
  );
}

function reportError(response: LocalResponse<null>, config?: InternalAxiosRequestConfig) {
  if (apiHooks.onError?.(response, config)) return;
  if (!config?.skipErrorToast && response.errorData) showErrorMessage(response.errorData);
}

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

function fileNameFromContentDisposition(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1];
  return (
    (encoded && safeDecode(encoded.trim().replace(/^"|"$/g, ''))) || /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim()
  );
}

const handleRequest = async (config: InternalAxiosRequestConfig) => {
  const blocked = apiHooks.onRequest?.(config);
  if (blocked) return Promise.reject(blocked);

  const token = await getAccessToken(store?.getState());
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const lang = (i18n.resolvedLanguage || i18n.language || '').split('-')[0];
  if (lang && !config.headers.has('Accept-Language')) config.headers.set('Accept-Language', lang);

  trackRequest(config);
  startLoading(config);
  return config;
};

const handleResponse = (axiosResponse: AxiosResponse<unknown>) => {
  const config = axiosResponse.config as RetryConfig;
  settle(config, axiosResponse.headers);

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

  const payload = axiosResponse.data as ApiBody | null;
  if (payload?.isSuccess === false) {
    const response = toErrorResponse(payload, axiosResponse.status);
    reportError(response, config);
    return Promise.reject(response);
  }

  const response: LocalResponse<unknown> = {
    isSuccess: true,
    data: payload?.data ?? null,
    uiMessage: payload?.uiMessage || '',
    errorData: null,
    statusCode: axiosResponse.status,
    ...(payload?.traceId && { traceId: payload.traceId })
  };
  if (response.uiMessage && shouldShowSuccess(config)) showSuccessMessage(response.uiMessage);
  return response as unknown as AxiosResponse;
};

const isLocalResponse = (value: unknown): value is LocalResponse<null> =>
  !axios.isAxiosError(value) && typeof (value as LocalResponse<null> | null)?.isSuccess === 'boolean';

const handleResponseError = async (error: AxiosError | LocalResponse<null>) => {
  if (isLocalResponse(error)) return Promise.reject(error);
  const config = error.config as RetryConfig | undefined;
  settle(config, error.response?.headers);

  if (isCanceled(error)) return Promise.reject(errorResponse({ header: '', message: '', code: 0 }));

  const status = error.response?.status;
  const response = toErrorResponse(error.response ? await readErrorBody(error.response.data) : null, status);

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

API.interceptors.request.use(handleRequest);
API.interceptors.response.use(handleResponse, handleResponseError);

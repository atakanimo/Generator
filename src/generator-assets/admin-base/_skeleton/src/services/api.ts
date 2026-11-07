/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
// `skipLoading` / `skipSuccessToast` on the axios config (contract §7)
import type {} from '@atakanimo/ata-admin-base';
import { setCommonLoading } from '@/store/slices/commonSlice';
import type { LocalResponse } from '@/types';
import { getTokenFromStorage } from '@/helper';
import { showError, showSuccess } from '@/components';
import { APP_CONFIG } from '@/config/app';

// Store dışarıdan inject edilir (döngüsel import olmasın diye).
let store: any = null;

export const injectStore = (_store: any) => {
  store = _store;
};

const BASE_URL = import.meta.env.VITE_API_BASE_URL || undefined;

let activeRequestsCount = 0;

/**
 * Tek axios örneği: admin-base data provider'ı ve elle yazılan servisler bunu kullanır. Interceptor loading'i, başarı
 * (`uiMessage`) ve hata toast'larını yönetir; cevap `LocalResponse` olarak döner (api-contract §7).
 */
export const API = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

function stopLoading(config?: InternalAxiosRequestConfig) {
  if (store && !config?.skipLoading) {
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    if (activeRequestsCount === 0) store.dispatch(setCommonLoading(false));
  }
}

const handleRequestSuccess = (config: InternalAxiosRequestConfig) => {
  if (store && !config.skipLoading) {
    activeRequestsCount++;
    store.dispatch(setCommonLoading(true));
  }
  const token = store?.getState().auth.token || getTokenFromStorage(APP_CONFIG.storage.token);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};

const handleRequestError = (error: AxiosError) => {
  stopLoading(error.config);
  const response: LocalResponse<null> = {
    isSuccess: false,
    data: null,
    uiMessage: '',
    errorData: { header: 'İstek atılırken bir hata oluştu', message: 'İstek atılırken bir hata oluştu', code: 500 }
  };
  return Promise.reject(response);
};

function shouldShowSuccessToast(method: string | undefined, url: string | undefined): boolean {
  const normalized = (method ?? 'get').toLowerCase();
  if (normalized === 'get' || normalized === 'head') return false;
  const path = (url ?? '').split('?')[0];
  return !(path.endsWith('/get-all') || path.endsWith('/me'));
}

const handleResponseSuccess = (axiosResponse: AxiosResponse<any>) => {
  stopLoading(axiosResponse.config);
  // Dosya indirme gibi zarfsız cevaplar olduğu gibi döner.
  if (axiosResponse.config.responseType === 'blob') return axiosResponse;

  const response: LocalResponse<any> = {
    isSuccess: true,
    data: axiosResponse.data?.data ?? null,
    uiMessage: axiosResponse.data?.uiMessage || '',
    errorData: null
  };
  if (response.uiMessage && !axiosResponse.config.skipSuccessToast && shouldShowSuccessToast(axiosResponse.config.method, axiosResponse.config.url)) {
    showSuccess(response.uiMessage);
  }
  return Promise.resolve(response as unknown as AxiosResponse<any>);
};

/** `refreshed`: yeni token var; `expired`: BE refresh token'ı reddetti (oturum biter); `offline`: sunucuya ulaşılamadı. */
type RefreshResult = 'refreshed' | 'expired' | 'offline';

/** Aynı anda gelen 401'ler tek refresh'i bekler (refresh token her kullanımda döner; ikinci istek eskisiyle 401 alırdı). */
let refreshing: Promise<RefreshResult> | null = null;

/**
 * Refresh token ile yeni oturum (docs/backend/auth.md). Token storage'dan okunur: başka sekme yenilediyse güncel olan
 * oradadır. Interceptor'sız (döngü olmasın).
 */
async function refreshSession(): Promise<RefreshResult> {
  const sent = getTokenFromStorage(APP_CONFIG.storage.refreshToken);
  if (!sent) return 'expired';
  const { sessionRefreshed, tokenAdopted } = await import('@/store/slices/authSlice');
  try {
    const res = await axios.post(APP_CONFIG.auth.refresh, { refreshToken: sent }, { baseURL: BASE_URL });
    store.dispatch(sessionRefreshed(res.data.data));
    return 'refreshed';
  } catch (error) {
    // Başka sekme aynı anda yeniledi: onun token'ları storage'da.
    const stored = getTokenFromStorage(APP_CONFIG.storage.refreshToken);
    const access = getTokenFromStorage(APP_CONFIG.storage.token);
    if (stored && access && stored !== sent) {
      store.dispatch(tokenAdopted({ token: access, refreshToken: stored }));
      return 'refreshed';
    }
    return axios.isAxiosError(error) && !error.response ? 'offline' : 'expired';
  }
}

const isAuthCall = (url: string | undefined) => {
  const path = (url ?? '').split('?')[0];
  return path.endsWith(APP_CONFIG.auth.login) || path.endsWith(APP_CONFIG.auth.refresh) || path.endsWith(APP_CONFIG.auth.logout);
};

const handleResponseError = async (error: AxiosError) => {
  stopLoading(error.config);
  // İptal edilen istekler (ör. yerini yenisine bırakan autocomplete) kullanıcı için hata değil.
  if (axios.isCancel(error as unknown)) return Promise.reject(error);

  // Access token'ın süresi doldu: bir kez yenile, isteği tekrarla; yenilenemezse oturum kapanır.
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  let offline = false;
  if (error.response?.status === 401 && store && original && !original._retried && !isAuthCall(original.url)) {
    refreshing ??= refreshSession().finally(() => {
      refreshing = null;
    });
    const result = await refreshing;
    if (result === 'refreshed') return API({ ...original, _retried: true } as InternalAxiosRequestConfig);
    offline = result === 'offline';
  }

  const response: LocalResponse<null> = { isSuccess: false, data: null, uiMessage: '', errorData: { header: '', message: '', code: 0 } };
  if (error.response) {
    const data = error.response.data as any;
    response.errorData = {
      code: data?.errorData?.code ?? error.response.status,
      header: data?.errorData?.header ?? '',
      message: data?.errorData?.message ?? error.message
    };
    // Sunucuya ulaşılamadıysa oturum kalır; bağlantı gelince tekrar denenir.
    if (error.response.status === 401 && store && !offline && !isAuthCall(error.config?.url)) {
      const { clearSession } = await import('@/store/slices/authSlice');
      store.dispatch(clearSession());
    }
  } else {
    response.errorData = { header: 'ERR_NETWORK', message: 'Sunucuya ulaşılamadı.', code: 0 };
  }

  showError(response.errorData?.message ?? '');
  return Promise.reject(response);
};

API.interceptors.request.use(handleRequestSuccess, handleRequestError);
API.interceptors.response.use(handleResponseSuccess, handleResponseError);

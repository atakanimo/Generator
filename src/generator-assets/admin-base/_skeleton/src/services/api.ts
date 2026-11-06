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

const handleResponseError = async (error: AxiosError) => {
  stopLoading(error.config);
  // İptal edilen istekler (ör. yerini yenisine bırakan autocomplete) kullanıcı için hata değil.
  if (axios.isCancel(error as unknown)) return Promise.reject(error);

  const response: LocalResponse<null> = { isSuccess: false, data: null, uiMessage: '', errorData: { header: '', message: '', code: 0 } };
  if (error.response) {
    const data = error.response.data as any;
    response.errorData = {
      code: data?.errorData?.code ?? error.response.status,
      header: data?.errorData?.header ?? '',
      message: data?.errorData?.message ?? error.message
    };
    if (error.response.status === 401 && store) {
      const { logout } = await import('@/store/slices/authSlice');
      store.dispatch(logout());
    }
  } else {
    response.errorData = { header: 'ERR_NETWORK', message: 'Sunucuya ulaşılamadı.', code: 0 };
  }

  showError(response.errorData?.message ?? '');
  return Promise.reject(response);
};

API.interceptors.request.use(handleRequestSuccess, handleRequestError);
API.interceptors.response.use(handleResponseSuccess, handleResponseError);

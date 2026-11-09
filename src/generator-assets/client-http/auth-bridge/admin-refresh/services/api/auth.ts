// Oturum köprüsü: access token'ı ve 401'deki refresh'i api.ts'e verir.
import axios from 'axios';
import type { ApiAuth } from '@/types';
import { getTokenFromStorage } from '@/helper';
import { APP_CONFIG } from '@/config/app';
import { BASE_URL } from './platform.generated';

type AuthState = { auth?: { token?: string | null } };

const tokenOf = (state: unknown) => (state as AuthState | undefined)?.auth?.token ?? null;

const apiAuth: ApiAuth = {
  getAccessToken: state => tokenOf(state) || getTokenFromStorage(APP_CONFIG.storage.token),
  hasSession: state => Boolean(tokenOf(state)),
  // Token storage'dan okunur (başka sekme yenilemiş olabilir); interceptor'sız axios, ağ hatasında oturum kalır.
  refreshSessionOnce: async dispatch => {
    const { sessionRefreshed, tokenAdopted, clearSession } = await import('@/store/slices/auth.slice');
    const sent = getTokenFromStorage(APP_CONFIG.storage.refreshToken);
    if (!sent) {
      dispatch(clearSession() as never);
      return false;
    }
    try {
      const res = await axios.post(APP_CONFIG.auth.refresh, { refreshToken: sent }, { baseURL: BASE_URL });
      dispatch(sessionRefreshed(res.data.data) as never);
      return true;
    } catch (error) {
      // Başka sekme aynı anda yeniledi: onun token'ları storage'da.
      const stored = getTokenFromStorage(APP_CONFIG.storage.refreshToken);
      const access = getTokenFromStorage(APP_CONFIG.storage.token);
      if (stored && access && stored !== sent) {
        dispatch(tokenAdopted({ token: access, refreshToken: stored }) as never);
        return true;
      }
      if (!(axios.isAxiosError(error) && !error.response)) dispatch(clearSession() as never);
      return false;
    }
  },
  isAuthRequest: url => {
    const path = (url ?? '').split('?')[0];
    return [APP_CONFIG.auth.login, APP_CONFIG.auth.refresh, APP_CONFIG.auth.logout].some(endpoint => path.endsWith(endpoint));
  }
};

export const { getAccessToken, hasSession, refreshSessionOnce, isAuthRequest } = apiAuth;

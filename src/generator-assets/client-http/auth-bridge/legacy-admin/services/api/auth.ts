// Oturum köprüsü: üretilen auth'a geçmemiş admin (docs/frontend/http-layer.md "apiAuth"). Geçiş dönemi örneği; proje
// kendi auth'una göre uyarlar. Auth ortaklaşınca `auth-bridge/generated` ile değiştirilir.
import type { ApiAuth } from '@/types';
import { getTokenFromStorage } from '@/helper';
import { APP_CONFIG } from '@/config/app';

type AuthState = { auth?: { token?: string | null } };

const tokenOf = (state: unknown) => (state as AuthState | undefined)?.auth?.token ?? null;

const apiAuth: ApiAuth = {
  // Store'daki; yoksa storage helper'ı.
  getAccessToken: state => tokenOf(state) || getTokenFromStorage(APP_CONFIG.storage.token),
  hasSession: state => Boolean(tokenOf(state)),
  // Refresh yok: 401 oturumu kapatır.
  refreshSessionOnce: async dispatch => {
    const { logout } = await import('@/store/slices/auth.slice');
    dispatch(logout() as never);
    return false;
  },
  isAuthRequest: url => (url ?? '').split('?')[0].endsWith(APP_CONFIG.auth.login)
};

export const { getAccessToken, hasSession, refreshSessionOnce, isAuthRequest } = apiAuth;

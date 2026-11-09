import type { ApiAuth } from '@/types';
import { getTokenFromStorage } from '@/helper';
import { APP_CONFIG } from '@/config/app';

type AuthState = { auth?: { token?: string | null } };

const tokenOf = (state: unknown) => (state as AuthState | undefined)?.auth?.token ?? null;

const apiAuth: ApiAuth = {
  getAccessToken: state => tokenOf(state) || getTokenFromStorage(APP_CONFIG.storage.token),
  hasSession: state => Boolean(tokenOf(state)),
  refreshSessionOnce: async dispatch => {
    const { logout } = await import('@/store/slices/auth.slice');
    dispatch(logout() as never);
    return false;
  },
  isAuthRequest: url => (url ?? '').split('?')[0].endsWith(APP_CONFIG.auth.login)
};

export const { getAccessToken, hasSession, refreshSessionOnce, isAuthRequest } = apiAuth;

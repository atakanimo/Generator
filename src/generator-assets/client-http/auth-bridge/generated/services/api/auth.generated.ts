// Oturum köprüsü: token saklama ve 401'de tek seferlik refresh.
import type { ApiAuth, ApiDispatch } from '@/types';
import * as service from '../auth.service.generated';
import { tokenStore } from './platform.generated';

const ACCESS_KEY = `${service.AUTH_STORAGE_PREFIX}.access_token`;
const REFRESH_KEY = `${service.AUTH_STORAGE_PREFIX}.refresh_token`;

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export const authStorage = {
  read: async (): Promise<StoredTokens> => ({ accessToken: await tokenStore.get(ACCESS_KEY), refreshToken: await tokenStore.get(REFRESH_KEY) }),
  /** `remember` verilmezse (refresh) token'lar bulundukları yerde kalır. */
  save: async (accessToken: string, refreshToken: string, remember?: boolean): Promise<void> => {
    const persistent = remember ?? (await tokenStore.isPersistent(REFRESH_KEY));
    await tokenStore.set(ACCESS_KEY, accessToken, persistent);
    await tokenStore.set(REFRESH_KEY, refreshToken, persistent);
  },
  clear: async (): Promise<void> => {
    await tokenStore.remove(ACCESS_KEY);
    await tokenStore.remove(REFRESH_KEY);
  }
};

/** Bunların 401'inde refresh denenmez. */
const NO_REFRESH: string[] = [service.AUTH_ENDPOINTS.login, service.AUTH_ENDPOINTS.refresh, service.AUTH_ENDPOINTS.logout];

export const isAuthRequest = (url: string | undefined): boolean => {
  const path = (url ?? '').split('?')[0];
  return NO_REFRESH.some(endpoint => path.endsWith(endpoint));
};

// Yalnız sunucu reddi oturumu kapatır; ağ hatası kapatmaz.
const sessionRefused = (error: unknown) => {
  const code = (error as { errorData?: { code?: number } } | null)?.errorData?.code;
  return code === 401 || code === 403;
};

async function run(dispatch: ApiDispatch): Promise<boolean> {
  const { sessionChanged, tokenAdopted } = await import('@/store/slices/auth.slice.generated');
  const sent = (await authStorage.read()).refreshToken;
  if (!sent) return false;
  try {
    const response = await service.refresh(sent);
    if (!response.isSuccess || !response.data) throw response;
    await authStorage.save(response.data.accessToken, response.data.refreshToken);
    dispatch(sessionChanged({ accessToken: response.data.accessToken, user: response.data.user }) as never);
    return true;
  } catch (error) {
    // Başka sekme önce yeniledi: onun token'ları storage'da.
    const stored = await authStorage.read();
    if (stored.accessToken && stored.refreshToken && stored.refreshToken !== sent) {
      dispatch(tokenAdopted(stored.accessToken) as never);
      return true;
    }
    if (sessionRefused(error)) {
      await authStorage.clear();
      dispatch(sessionChanged(null) as never);
    }
    return false;
  }
}

let pending: Promise<boolean> | null = null;

/** Aynı anda gelen 401'ler tek isteği bekler. */
export function refreshSession(dispatch: ApiDispatch): Promise<boolean> {
  pending ??= run(dispatch).finally(() => {
    pending = null;
  });
  return pending;
}

type AuthState = { auth?: { accessToken?: string | null } };

const accessTokenOf = (state: unknown) => (state as AuthState | undefined)?.auth?.accessToken ?? null;

const apiAuth: ApiAuth = {
  getAccessToken: async state => accessTokenOf(state) || (await authStorage.read()).accessToken,
  hasSession: state => Boolean(accessTokenOf(state)),
  refreshSessionOnce: refreshSession,
  isAuthRequest
};

export const { getAccessToken, hasSession, refreshSessionOnce } = apiAuth;

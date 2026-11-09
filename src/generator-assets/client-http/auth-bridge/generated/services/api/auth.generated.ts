import type { ApiAuth, ApiDispatch } from '@/types';
import * as service from '../auth.service.generated';
import { tokenStore } from './platform.generated';

const accessKey = () => `${service.AUTH_STORAGE_PREFIX}.access_token`;
const refreshKey = () => `${service.AUTH_STORAGE_PREFIX}.refresh_token`;

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export const authStorage = {
  read: async (): Promise<StoredTokens> => ({ accessToken: await tokenStore.get(accessKey()), refreshToken: await tokenStore.get(refreshKey()) }),
  save: async (accessToken: string, refreshToken: string, remember?: boolean): Promise<void> => {
    const persistent = remember ?? (await tokenStore.isPersistent(refreshKey()));
    await tokenStore.set(accessKey(), accessToken, persistent);
    await tokenStore.set(refreshKey(), refreshToken, persistent);
  },
  clear: async (): Promise<void> => {
    await tokenStore.remove(accessKey());
    await tokenStore.remove(refreshKey());
  }
};

const noRefresh = (): string[] => [service.AUTH_ENDPOINTS.login, service.AUTH_ENDPOINTS.refresh, service.AUTH_ENDPOINTS.logout];

export const isAuthRequest = (url: string | undefined): boolean => {
  const path = (url ?? '').split('?')[0];
  return noRefresh().some(endpoint => path.endsWith(endpoint));
};

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

import type { ApiAuth } from '@/types';
import { resetAuthState } from '@/store/slices/auth.slice';

type AuthState = { auth?: { token?: string | null } };

const tokenOf = (state: unknown) => (state as AuthState | undefined)?.auth?.token ?? null;

const apiAuth: ApiAuth = {
  getAccessToken: state => tokenOf(state),
  hasSession: state => Boolean(tokenOf(state)),
  refreshSessionOnce: async dispatch => {
    dispatch(resetAuthState() as never);
    return false;
  },
  isAuthRequest: () => false
};

export const { getAccessToken, hasSession, refreshSessionOnce, isAuthRequest } = apiAuth;

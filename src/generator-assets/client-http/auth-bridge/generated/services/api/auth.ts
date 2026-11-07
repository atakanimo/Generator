// Oturum köprüsü: üretilen auth (docs/frontend/http-layer.md "apiAuth"). Üretilen auth katmanı olan her uygulamada
// birebir aynıdır (auth ortaklaşınca hepsi bu dosyaya geçer).
import type { ApiAuth } from '@/types';
import { authStorage } from '../authStorage.generated';
import * as authRefresh from '../authRefresh.generated';

type AuthState = { auth?: { accessToken?: string | null } };

const accessTokenOf = (state: unknown) => (state as AuthState | undefined)?.auth?.accessToken ?? null;

const apiAuth: ApiAuth = {
  // Store'daki; yoksa ortak storage (başka sekme / soğuk açılış).
  getAccessToken: async state => accessTokenOf(state) || (await authStorage.read()).accessToken,
  hasSession: state => Boolean(accessTokenOf(state)),
  // Sunucu refresh token'ı reddederse oturumu üretilen auth kapatır; ağ hatası kapatmaz.
  refreshSessionOnce: () => authRefresh.refreshSessionOnce(),
  isAuthRequest: url => authRefresh.isAuthRequest(url)
};

export const { getAccessToken, hasSession, refreshSessionOnce, isAuthRequest } = apiAuth;

/**
 * Panelin tek ayar dosyası (Generator bir kez yazar, sonra sizin).
 * Auth uçları Generator'ın ortak auth katmanındandır (docs/backend/auth.md): `POST login` / `refresh` →
 * `AuthSession` (`{ accessToken, refreshToken, expiresIn, user }`), `GET me` → `AuthUser`, `POST logout`
 * (`types/API`). Kullanıcı `role: 'admin'` değilse panel girişi reddeder.
 */
export const APP_CONFIG = {
  name: '__App__',
  /** `localStorage` / `sessionStorage` anahtarları. */
  storage: {
    token: '__app__.auth_token',
    refreshToken: '__app__.refresh_token',
    themeMode: '__app__.theme_mode'
  },
  auth: {
    login: '__API_PREFIX__/auth/login',
    refresh: '__API_PREFIX__/auth/refresh',
    logout: '__API_PREFIX__/auth/logout',
    me: '__API_PREFIX__/auth/me'
  },
  /** Girişten sonra ve bilinmeyen yollarda açılan sayfa. */
  homePath: '/dashboard'
} as const;

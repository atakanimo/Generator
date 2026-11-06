/**
 * Panelin tek ayar dosyası (Generator bir kez yazar, sonra sizin).
 * Auth uçları Generator'ın ürettiği backend'de yoktur: backend `POST login` → `{ token, user }` ve `GET me` → `user`
 * (`types/API`) vermelidir; kullanıcı `role: 'admin'` değilse panel girişi reddeder.
 */
export const APP_CONFIG = {
  name: '__App__',
  /** `localStorage` / `sessionStorage` anahtarları. */
  storage: {
    token: '__app__.auth_token',
    themeMode: '__app__.theme_mode'
  },
  auth: {
    login: '__API_PREFIX__/auth/login',
    me: '__API_PREFIX__/auth/me'
  },
  /** Girişten sonra ve bilinmeyen yollarda açılan sayfa. */
  homePath: '/dashboard'
} as const;

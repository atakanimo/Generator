/** Interceptor çıktısı (api-contract §7): zarfın `data`'sı, mesaj ve hata. */
export interface LocalResponse<T> {
  isSuccess: boolean;
  data: T;
  uiMessage: string;
  errorData: { header: string; message: string; code: number } | null;
}

/** `GET <auth.me>` ve oturum cevabındaki kullanıcı (docs/backend/auth.md "Sözleşme"). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  provider: 'password' | 'google' | 'apple';
  emailVerified: boolean;
  hasPassword: boolean;
}

/** `POST <auth.login>` / `POST <auth.refresh>` cevabı; host'a özel ek alanlar da gelebilir (`onSession`). */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Access token'ın ömrü (saniye). */
  expiresIn: number;
  user: AuthUser;
  isNewUser?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Interceptor çıktısı (api-contract §7): zarfın `data`'sı, mesaj ve hata. */
export interface LocalResponse<T> {
  isSuccess: boolean;
  data: T;
  uiMessage: string;
  errorData: { header: string; message: string; code: number } | null;
}

/** `GET <auth.me>`, `POST <auth.login>` cevabındaki kullanıcı (`config/app.ts`). */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

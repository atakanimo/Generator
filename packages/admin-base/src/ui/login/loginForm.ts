/** Login formunun saf kısmı: doğrulama ve "beni hatırla" saklama (test edilebilir, React'siz). */
import { EMAIL_PATTERN } from '../patterns.js';

export interface LoginErrors {
  email?: string;
  password?: string;
}


export function validateLogin(
  values: { email: string; password: string },
  messages: { required: string; emailInvalid: string }
): LoginErrors {
  const errors: LoginErrors = {};
  const email = values.email.trim();
  if (!email) errors.email = messages.required;
  else if (!EMAIL_PATTERN.test(email)) errors.email = messages.emailInvalid;
  if (!values.password) errors.password = messages.required;
  return errors;
}

/** `localStorage` yoksa ya da erişim hata verirse (gizli mod) sessizce vazgeçer. */
export function readRememberedEmail(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** `null` → kaydı siler. */
export function writeRememberedEmail(key: string, email: string | null): void {
  try {
    if (email) globalThis.localStorage?.setItem(key, email);
    else globalThis.localStorage?.removeItem(key);
  } catch {
    // depolama kapalı: hatırlama olmadan devam
  }
}

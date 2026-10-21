/**
 * HTTP log öncesi redaksiyon (tasks §10.6).
 * - Anahtarlar (küçük harf): password, token*, authorization*, otp*, secret*, api*key*, idToken, identityToken, refreshToken, accessToken, creditCard, cvv, iban
 * - `email`: maske (ilk harf + domain)
 * - `fcmTokens` / `fcmToken`: uzunluk özeti
 * - Derinlik / boyut sınırı (aşırı büyük gövdeyi keser)
 */
const SENSITIVE_KEY = new Set(
  [
    'password',
    'oldpassword',
    'newpassword',
    'currentpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'idtoken',
    'identitytoken',
    'otpcode',
    'otp',
    'secret',
    'apikey',
    'api_key',
    'privatekey',
    'creditcard',
    'cvv',
    'iban',
    'creditcardnumber'
  ].map(k => k.toLowerCase())
);

const MAX_DEPTH = 8;
const MAX_ARRAY = 30;
const MAX_STRING = 2000;

function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) {
    return '[redacted-email]';
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return '[max-depth]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY).map(v => sanitizeValue(v, depth + 1));
    if (value.length > MAX_ARRAY) {
      return [...slice, `[+${value.length - MAX_ARRAY} more]`];
    }
    return slice;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (SENSITIVE_KEY.has(lk)) {
      out[k] = '[redacted]';
      continue;
    }
    if (lk === 'email' && typeof v === 'string') {
      out[k] = maskEmail(v);
      continue;
    }
    if ((lk === 'fcmtokens' || lk === 'fcmtoken') && Array.isArray(v)) {
      out[k] = `[${v.length} fcm tokens]`;
      continue;
    }
    if (lk === 'fcmtoken' && typeof v === 'string') {
      out[k] = '[fcm token]';
      continue;
    }
    out[k] = sanitizeValue(v, depth + 1);
  }
  return out;
}

/** Query / body JSON log için güvenli kopya. */
export function sanitizeForLog(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

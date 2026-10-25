/** Ayarlar yalnız ortamdan (`.env` + ortam değişkenleri) okunur; sır koda yazılmaz. */

const MIN_JWT_SECRET_LENGTH = 32;

/** JWT imza anahtarı; en az 32 karakter değilse uygulama açılmaz. */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET en az ${MIN_JWT_SECRET_LENGTH} karakter olmalı (.env).`);
  }
  return secret;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

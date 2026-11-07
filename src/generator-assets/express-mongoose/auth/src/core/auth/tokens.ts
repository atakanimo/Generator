import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { optionalEnv, requireJwtSecret } from '@config/env';

/** Access token lifetime in seconds (`JWT_ACCESS_TTL_MINUTES`, default 15). */
export function accessTokenTtlSeconds(): number {
  return Math.max(1, Number(optionalEnv('JWT_ACCESS_TTL_MINUTES') ?? 15)) * 60;
}

/** Refresh token lifetime in milliseconds (`JWT_REFRESH_TTL_DAYS`, default 30). */
export function refreshTokenTtlMs(): number {
  return Math.max(1, Number(optionalEnv('JWT_REFRESH_TTL_DAYS') ?? 30)) * 24 * 60 * 60 * 1000;
}

/** HS256 access token: `sub`, `role`, `jti`, `iat`, `exp` (+ `iss` / `aud` when set). */
export function signAccessToken(userId: string, role: string): string {
  const options: SignOptions = { algorithm: 'HS256', expiresIn: accessTokenTtlSeconds(), subject: userId, jwtid: randomUUID() };
  const issuer = optionalEnv('JWT_ISSUER');
  const audience = optionalEnv('JWT_AUDIENCE');
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;
  return jwt.sign({ role }, requireJwtSecret(), options);
}

/** Opaque refresh token (48 random bytes, base64url); only its SHA-256 is stored. */
export function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

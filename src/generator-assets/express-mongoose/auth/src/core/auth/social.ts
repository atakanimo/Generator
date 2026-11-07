// @auth-file google|apple
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { optionalEnv } from '@config/env';
import { getAppLogger } from '@core/logging/logger';

export interface SocialIdentity {
  providerUserId: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  /** Client id the token was issued to (Apple's code exchange needs the same `client_id`). */
  audience?: string;
}

/** Configured client ids; empty → every token is refused (logged, so a missing `.env` key is visible). */
function clientIds(name: string): string[] {
  const ids = (optionalEnv(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) getAppLogger().error({ event: 'auth.social-config', key: name }, `${name} ayarlı değil (.env)`);
  return ids;
}

// @if google
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Google ID token (`GOOGLE_CLIENT_IDS`: web / iOS / Android client ids, comma separated). `null` → invalid. */
export async function verifyGoogleIdToken(idToken: string): Promise<SocialIdentity | null> {
  const audience = clientIds('GOOGLE_CLIENT_IDS');
  if (!audience.length) return null;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience
    });
    if (!payload.sub) return null;
    return {
      providerUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined
    };
  } catch {
    return null;
  }
}
// @endif
// @if apple
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/** Apple identity token (`APPLE_CLIENT_IDS`: bundle id / service id, comma separated). `null` → invalid. */
export async function verifyAppleIdentityToken(identityToken: string): Promise<SocialIdentity | null> {
  const audience = clientIds('APPLE_CLIENT_IDS');
  if (!audience.length) return null;
  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, { issuer: 'https://appleid.apple.com', audience });
    if (!payload.sub) return null;
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    return {
      providerUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined,
      emailVerified: verified,
      audience: typeof payload.aud === 'string' ? payload.aud : payload.aud?.[0]
    };
  } catch {
    return null;
  }
}
// @endif

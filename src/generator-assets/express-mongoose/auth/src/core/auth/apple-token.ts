// @auth-file apple
import { SignJWT, decodeJwt, importPKCS8 } from 'jose';
import { optionalEnv } from '@config/env';
import { getAppLogger } from '@core/logging/logger';
import type { SocialIdentity } from './social';

/**
 * Apple refresh token (docs/backend/auth.md "Apple token iptali"): taken with `authorizationCode` at sign-in, revoked
 * when the account is deleted (App Store rule). Needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8);
 * without them both steps are skipped and sign-in is not affected.
 */
const APPLE_HOST = 'https://appleid.apple.com';
const TIMEOUT_MS = 10_000;

const clientIds = () => (optionalEnv('APPLE_CLIENT_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Short-lived ES256 client secret signed with the .p8 key. */
async function clientSecret(clientId: string): Promise<string | null> {
  const teamId = optionalEnv('APPLE_TEAM_ID');
  const keyId = optionalEnv('APPLE_KEY_ID');
  // One line in `.env`: line breaks may be written as `\n`.
  const privateKey = optionalEnv('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) {
    getAppLogger().warn({ event: 'auth.apple-config' }, 'APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY ayarlı değil: Apple token iptali atlanır');
    return null;
  }
  const key = await importPKCS8(privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setAudience(APPLE_HOST)
    .setSubject(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

const post = (path: string, form: Record<string, string>) =>
  fetch(`${APPLE_HOST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

/** `null` when the exchange fails or the code belongs to another Apple account. Sign-in goes on either way. */
export async function exchangeAppleCode(authorizationCode: string, identity: SocialIdentity): Promise<string | null> {
  const clientId = identity.audience ?? clientIds()[0];
  if (!clientId) return null;
  try {
    const secret = await clientSecret(clientId);
    if (!secret) return null;
    const res = await post('/auth/token', { client_id: clientId, client_secret: secret, code: authorizationCode, grant_type: 'authorization_code' });
    if (!res.ok) {
      getAppLogger().info({ event: 'auth.apple-exchange', status: res.status }, 'Apple token exchange failed');
      return null;
    }
    const body = (await res.json()) as { refresh_token?: string; id_token?: string };
    // The code belongs to another Apple account (the client mixed two accounts up): the token is not kept.
    if (!body.id_token || decodeJwt(body.id_token).sub !== identity.providerUserId) {
      getAppLogger().warn({ event: 'auth.apple-exchange' }, 'Apple token exchange subject mismatch');
      return null;
    }
    return body.refresh_token ?? null;
  } catch (error) {
    getAppLogger().warn({ event: 'auth.apple-exchange', err: error }, 'Apple token exchange error');
    return null;
  }
}

/** Tries the configured client ids in turn (the token is revoked with the id it was issued to). */
export async function revokeAppleToken(refreshToken: string): Promise<boolean> {
  try {
    for (const clientId of clientIds()) {
      const secret = await clientSecret(clientId);
      if (!secret) return false;
      const res = await post('/auth/revoke', { client_id: clientId, client_secret: secret, token: refreshToken, token_type_hint: 'refresh_token' });
      if (res.ok) return true;
    }
  } catch (error) {
    getAppLogger().warn({ event: 'auth.apple-revoke', err: error }, 'Apple revoke error');
    return false;
  }
  getAppLogger().warn({ event: 'auth.apple-revoke' }, 'Apple refresh token could not be revoked');
  return false;
}

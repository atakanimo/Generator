// @auth-file register|password-reset
import { randomInt, timingSafeEqual } from 'crypto';
import { sha256 } from './tokens';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** 6-digit code from the CSPRNG. */
export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  return sha256(code);
}

export function otpMatches(code: string, codeHash: string): boolean {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(codeHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

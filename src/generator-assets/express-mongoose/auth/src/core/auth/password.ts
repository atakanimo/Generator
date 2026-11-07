import bcrypt from 'bcryptjs';

/** bcrypt cost (docs/backend/auth.md "Şifre"); the three stacks use the same value. */
export const BCRYPT_COST = 12;

/** Compared when the user does not exist, so the response time does not reveal registered e-mails. */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export type PasswordPolicyKey = 'auth.passwordTooShort' | 'auth.passwordTooLong' | 'auth.passwordWeak';

/** 8+ characters, at most 72 bytes (bcrypt ignores the rest), a letter and a digit. `null` → valid. */
export function passwordPolicyError(password: string): PasswordPolicyKey | null {
  if (password.length < 8) return 'auth.passwordTooShort';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'auth.passwordTooLong';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'auth.passwordWeak';
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** `hash` absent (unknown user, social-only account) → compares against a dummy hash and returns `false`. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

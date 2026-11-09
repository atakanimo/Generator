import { Types } from 'mongoose';
import { ErrorResponse, SuccessResponse } from '@core/response/response.helper';
import type { IApiResponse } from '@core/types/api-contract';
import { hashPassword, passwordPolicyError, verifyPassword } from '@core/auth/password';
import { accessTokenTtlSeconds, newRefreshToken, refreshTokenTtlMs, sha256, signAccessToken } from '@core/auth/tokens';
// @if register|password-reset
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, hashOtp, newOtpCode, otpMatches } from '@core/auth/otp';
import { mailSender } from '@core/auth/mailer';
// @endif
// @if google|apple
import type { SocialIdentity } from '@core/auth/social';
// @endif
// @if google
import { verifyGoogleIdToken } from '@core/auth/social';
// @endif
// @if apple
import { verifyAppleIdentityToken } from '@core/auth/social';
import { exchangeAppleCode, revokeAppleToken } from '@core/auth/apple-token';
// @endif
import { t } from '@helpers';
import { Users, type IUsers } from '@modules/users/users.model';
// @if register|password-reset
import { OtpCodes, type OtpPurpose } from './auth.models';
// @endif
import { RefreshTokens } from './auth.models';
import { authHooks } from './auth.hooks';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  provider: string;
  emailVerified: boolean;
  /** False for a Google / Apple account that has not created a password yet (`set-password`). */
  hasPassword: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
  isNewUser?: boolean;
}

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

const unauthorized = <T>(message = t('auth.invalidCredentials')): IApiResponse<T> =>
  ErrorResponse<T>({ header: t('common.unauthorized'), message, code: 'UNAUTHORIZED' });
const forbidden = <T>(message: string): IApiResponse<T> => ErrorResponse<T>({ header: t('common.forbidden'), message, code: 'FORBIDDEN' });
const badRequest = <T>(message: string): IApiResponse<T> => ErrorResponse<T>({ header: t('common.badRequest'), message, code: 'BAD_REQUEST' });

export function toAuthUser(user: IUsers): AuthUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role === 'admin' ? 'admin' : 'user',
    provider: user.provider,
    emailVerified: user.emailVerified,
    hasPassword: Boolean(user.passwordHash)
  };
}

/** The user behind a valid access token: `null` when missing or suspended (auth middleware → 401 / 403). */
export async function loadUser(userId: string): Promise<IUsers | null> {
  if (!Types.ObjectId.isValid(userId)) return null;
  return Users.findById(userId).exec();
}

async function withHookFields<T extends object>(user: IUsers, data: T, session: AuthSession | null): Promise<T> {
  const extra = authHooks.onSession ? await authHooks.onSession(user, session) : {};
  return { ...extra, ...data };
}

async function issueSession(user: IUsers, client: ClientInfo, isNewUser?: boolean): Promise<AuthSession> {
  const refreshToken = newRefreshToken();
  await RefreshTokens.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
    userAgent: client.userAgent?.slice(0, 300),
    ip: client.ip
  });
  const session: AuthSession = {
    accessToken: signAccessToken(String(user._id), user.role),
    refreshToken,
    expiresIn: accessTokenTtlSeconds(),
    user: toAuthUser(user),
    ...(isNewUser === undefined ? {} : { isNewUser })
  };
  return withHookFields(user, session, session);
}

async function revokeAllSessions(userId: Types.ObjectId | string): Promise<void> {
  await RefreshTokens.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
}

/**
 * Admin accounts sign in with e-mail + password only (docs/backend/auth.md "Admin ve kullanıcı"): register, reset,
 * social login, set-password and account deletion are for `user` accounts.
 */
const isAdmin = (user: IUsers): boolean => user.role === 'admin';

function sessionBlock<T>(user: IUsers): IApiResponse<T> | null {
  if (user.status === 'suspended') return forbidden<T>(t('auth.suspended'));
  return null;
}

export async function login(email: string, password: string, client: ClientInfo): Promise<IApiResponse<AuthSession>> {
  const user = await Users.findOne({ email }).exec();
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) return unauthorized();
  const blocked = sessionBlock<AuthSession>(user);
  if (blocked) return blocked;
  // @if register
  // An admin has no way to verify (no OTP for admins): only `user` accounts are held back.
  if (!user.emailVerified && !isAdmin(user)) {
    return ErrorResponse<AuthSession>({ header: t('common.forbidden'), message: t('auth.emailNotVerified'), code: 'EMAIL_NOT_VERIFIED' });
  }
  // @endif
  user.lastLoginAt = new Date();
  await user.save();
  return SuccessResponse(await issueSession(user, client), t('auth.loggedIn'));
}

/** Rotation: the presented token is used up in one atomic step (two requests with it → only one wins). */
export async function refresh(refreshToken: string, client: ClientInfo): Promise<IApiResponse<AuthSession>> {
  const row = await RefreshTokens.findOneAndUpdate(
    { tokenHash: sha256(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } }
  ).exec();
  if (!row) return unauthorized(t('auth.invalidToken'));
  const user = await Users.findById(row.userId).exec();
  if (!user) return unauthorized(t('auth.invalidToken'));
  const blocked = sessionBlock<AuthSession>(user);
  if (blocked) return blocked;
  return SuccessResponse(await issueSession(user, client));
}

export async function logout(refreshToken: string | undefined): Promise<IApiResponse<null>> {
  if (refreshToken) {
    await RefreshTokens.updateOne({ tokenHash: sha256(refreshToken), revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
  }
  return SuccessResponse(null, t('auth.loggedOut'));
}

export async function me(user: IUsers): Promise<IApiResponse<AuthUser>> {
  return SuccessResponse(await withHookFields(user, toAuthUser(user), null));
}

export async function changePassword(user: IUsers, currentPassword: string, newPassword: string): Promise<IApiResponse<null>> {
  if (!(await verifyPassword(currentPassword, user.passwordHash))) return badRequest(t('auth.wrongPassword'));
  const policy = passwordPolicyError(newPassword);
  if (policy) return badRequest(t(policy));
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessions(user._id as Types.ObjectId);
  return SuccessResponse(null, t('auth.passwordChanged'));
}

/** Admin sets a user's password (admin CRUD never writes `passwordHash`). Ends that user's sessions. */
export async function adminSetPassword(userId: string, newPassword: string): Promise<IApiResponse<null>> {
  const policy = passwordPolicyError(newPassword);
  if (policy) return badRequest(t(policy));
  const user = await loadUser(userId);
  if (!user) return ErrorResponse({ header: t('common.notFound'), message: t('common.notFound'), code: 'NOT_FOUND' });
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessions(user._id as Types.ObjectId);
  return SuccessResponse(null, t('auth.passwordChanged'));
}
// @if register|password-reset

async function sendOtp(user: IUsers, purpose: OtpPurpose): Promise<void> {
  const code = newOtpCode();
  await OtpCodes.deleteMany({ userId: user._id, purpose }).exec();
  await OtpCodes.create({ userId: user._id, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 });
  const subject = t(purpose === 'verify' ? 'auth.mail.verifySubject' : 'auth.mail.resetSubject');
  await mailSender.send({
    to: user.email,
    subject,
    text: t('auth.mail.codeText', { code, minutes: OTP_TTL_MS / 60000 }),
    otp: { purpose, code, name: user.name }
  });
}

/** Wrong code → attempts++; after `OTP_MAX_ATTEMPTS` the code is dead (a new one must be requested). */
async function consumeOtp(user: IUsers, purpose: OtpPurpose, code: string): Promise<boolean> {
  const row = await OtpCodes.findOne({ userId: user._id, purpose, consumedAt: null }).exec();
  if (!row || row.expiresAt.getTime() <= Date.now() || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  if (!otpMatches(code, row.codeHash)) {
    row.attempts += 1;
    await row.save();
    return false;
  }
  row.consumedAt = new Date();
  await row.save();
  return true;
}
// @endif
// @if register

export async function register(input: { email: string; password: string; name: string }): Promise<IApiResponse<null>> {
  const policy = passwordPolicyError(input.password);
  if (policy) return badRequest(t(policy));
  const existing = await Users.findOne({ email: input.email }).exec();
  if (existing) {
    // Same answer as a new account (the e-mail is not revealed). An unverified account belongs to whoever proves the
    // address with the code, so the latest sign-up's password replaces the old one.
    if (!existing.emailVerified && existing.provider === 'password' && !isAdmin(existing)) {
      existing.passwordHash = await hashPassword(input.password);
      existing.name = input.name;
      await existing.save();
      await sendOtp(existing, 'verify');
    }
    return SuccessResponse(null, t('auth.otpSent'));
  }
  const user = new Users({
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    role: 'user',
    status: 'active',
    emailVerified: false,
    provider: 'password'
  });
  if (authHooks.onRegister) await authHooks.onRegister(user, input);
  await user.save();
  await sendOtp(user, 'verify');
  return SuccessResponse(null, t('auth.otpSent'));
}

export async function verifyEmail(email: string, code: string, client: ClientInfo): Promise<IApiResponse<AuthSession>> {
  const user = await Users.findOne({ email }).exec();
  if (!user || isAdmin(user) || !(await consumeOtp(user, 'verify', code))) return badRequest(t('auth.invalidCode'));
  const blocked = sessionBlock<AuthSession>(user);
  if (blocked) return blocked;
  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();
  return SuccessResponse(await issueSession(user, client, true), t('auth.emailVerified'));
}

export async function resendOtp(email: string, purpose: OtpPurpose): Promise<IApiResponse<null>> {
  const user = await Users.findOne({ email }).exec();
  if (user && user.status === 'active' && !isAdmin(user) && (purpose === 'reset' || !user.emailVerified)) await sendOtp(user, purpose);
  return SuccessResponse(null, t('auth.otpSent'));
}
// @endif
// @if password-reset

export async function forgotPassword(email: string): Promise<IApiResponse<null>> {
  const user = await Users.findOne({ email }).exec();
  if (user && user.status === 'active' && !isAdmin(user)) await sendOtp(user, 'reset');
  return SuccessResponse(null, t('auth.otpSent'));
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<IApiResponse<null>> {
  const policy = passwordPolicyError(newPassword);
  if (policy) return badRequest(t(policy));
  const user = await Users.findOne({ email }).exec();
  if (!user || isAdmin(user) || !(await consumeOtp(user, 'reset', code))) return badRequest(t('auth.invalidCode'));
  user.passwordHash = await hashPassword(newPassword);
  user.emailVerified = true;
  await user.save();
  await revokeAllSessions(user._id as Types.ObjectId);
  return SuccessResponse(null, t('auth.passwordChanged'));
}
// @endif
// @if google|apple

/**
 * Social login: the provider id finds the user; otherwise a verified e-mail links an existing account; otherwise a
 * new `user` is created (`isNewUser: true`).
 */
async function socialLogin(
  provider: 'google' | 'apple',
  identity: SocialIdentity | null,
  client: ClientInfo,
  fallbackName?: string,
  appleRefreshToken?: string | null
): Promise<IApiResponse<AuthSession>> {
  if (!identity) return unauthorized(t('auth.invalidToken'));
  let user = await Users.findOne({ provider, providerUserId: identity.providerUserId }).exec();
  let isNewUser = false;
  if (!user && identity.email) {
    user = await Users.findOne({ email: identity.email }).exec();
    if (user && isAdmin(user)) return forbidden(t('auth.adminPasswordOnly'));
    // An address the provider has not verified cannot claim an existing account.
    if (user && !identity.emailVerified) return badRequest(t('auth.emailInUse'));
    // The provider proved the address: a password set by whoever registered it unverified stops working.
    if (user && !user.emailVerified) user.passwordHash = undefined;
  }
  if (!user) {
    if (!identity.email) return badRequest(t('auth.emailRequired'));
    user = new Users({
      email: identity.email,
      name: identity.name ?? fallbackName ?? identity.email.split('@')[0],
      role: 'user',
      status: 'active',
      emailVerified: identity.emailVerified,
      provider,
      providerUserId: identity.providerUserId
    });
    if (authHooks.onRegister) await authHooks.onRegister(user, { provider });
    isNewUser = true;
  }
  if (isAdmin(user)) return forbidden(t('auth.adminPasswordOnly'));
  const blocked = sessionBlock<AuthSession>(user);
  if (blocked) return blocked;
  if (identity.emailVerified) user.emailVerified = true;
  // @if apple
  if (appleRefreshToken) user.appleRefreshToken = appleRefreshToken;
  // @endif
  user.lastLoginAt = new Date();
  await user.save();
  return SuccessResponse(await issueSession(user, client, isNewUser), t('auth.loggedIn'));
}

/** A Google / Apple account creates its first password (afterwards `change-password`). Other sessions stay. */
export async function setPassword(user: IUsers, newPassword: string): Promise<IApiResponse<null>> {
  if (isAdmin(user)) return forbidden(t('auth.adminNotAllowed'));
  if (user.passwordHash) return badRequest(t('auth.passwordAlreadySet'));
  const policy = passwordPolicyError(newPassword);
  if (policy) return badRequest(t(policy));
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  return SuccessResponse(null, t('auth.passwordCreated'));
}
// @endif
// @if google

export async function loginWithGoogle(idToken: string, client: ClientInfo): Promise<IApiResponse<AuthSession>> {
  return socialLogin('google', await verifyGoogleIdToken(idToken), client);
}
// @endif
// @if apple

/** With `authorizationCode` Apple's refresh token is kept, to revoke it when the account is deleted (docs/backend/auth.md). */
export async function loginWithApple(
  identityToken: string,
  client: ClientInfo,
  fullName?: string,
  authorizationCode?: string
): Promise<IApiResponse<AuthSession>> {
  const identity = await verifyAppleIdentityToken(identityToken);
  const appleRefreshToken = identity && authorizationCode ? await exchangeAppleCode(authorizationCode, identity) : null;
  return socialLogin('apple', identity, client, fullName, appleRefreshToken);
}
// @endif
// @if account-delete

export async function deleteAccount(user: IUsers): Promise<IApiResponse<null>> {
  // An admin account is removed by another admin from the panel, never by itself.
  if (isAdmin(user)) return forbidden(t('auth.adminNotAllowed'));
  if (authHooks.onAccountDelete) await authHooks.onAccountDelete(user);
  await RefreshTokens.deleteMany({ userId: user._id }).exec();
  // @if register|password-reset
  await OtpCodes.deleteMany({ userId: user._id }).exec();
  // @endif
  await Users.deleteOne({ _id: user._id }).exec();
  // @if apple
  // App Store rule: an Apple account's token is revoked at Apple too (a failure is logged; the deletion stands).
  if (user.appleRefreshToken) await revokeAppleToken(user.appleRefreshToken);
  // @endif
  return SuccessResponse(null, t('auth.accountDeleted'));
}
// @endif

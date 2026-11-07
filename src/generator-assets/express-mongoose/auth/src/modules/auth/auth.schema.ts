import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(320);
/** Policy (length, letter + digit) is checked in the service so the message comes from i18n. */
const password = z.string().min(1).max(200);

export const LoginBodySchema = z.object({ email, password });
export const RefreshBodySchema = z.object({ refreshToken: z.string().min(1).max(200) });
export const LogoutBodySchema = z.object({ refreshToken: z.string().min(1).max(200).optional() });
export const ChangePasswordBodySchema = z.object({ currentPassword: password, newPassword: password });
export const AdminSetPasswordBodySchema = z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/i), newPassword: password });
// @if register
export const RegisterBodySchema = z.object({ email, password, name: z.string().trim().min(1).max(200) });
export const VerifyEmailBodySchema = z.object({ email, code: z.string().regex(/^\d{6}$/) });
export const SendOtpBodySchema = z.object({ email, purpose: z.enum(['verify', 'reset']).default('verify') });
// @endif
// @if password-reset
export const ForgotPasswordBodySchema = z.object({ email });
export const ResetPasswordBodySchema = z.object({ email, code: z.string().regex(/^\d{6}$/), newPassword: password });
// @endif
// @if google
export const GoogleBodySchema = z.object({ idToken: z.string().min(1) });
// @endif
// @if apple
export const AppleBodySchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().optional(),
  fullName: z.string().trim().max(200).optional()
});
// @endif
// @if google|apple
export const SetPasswordBodySchema = z.object({ newPassword: password });
// @endif

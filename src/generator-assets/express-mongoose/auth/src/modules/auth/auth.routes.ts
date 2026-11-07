import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { validate } from '@core';
import { authRateLimit } from '@core/auth/rate-limit';
import { AtaResponse } from '@core/response/response.helper';
import { adminAuthMiddleware, authMiddleware } from '@middlewares';
import * as authService from './auth.service';
import * as S from './auth.schema';

// <custom-imports>
// </custom-imports>

/** `/api/auth` (docs/backend/auth.md "Sözleşme"). Created once by the Generator: edit freely. */
const router: Router = express.Router();

const client = (req: Request): authService.ClientInfo => ({ userAgent: req.get('user-agent') ?? undefined, ip: req.ip });

/** Express 4 does not catch a rejected handler: hand the error to `errorHandler` (500 envelope). */
const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

router.post('/login', authRateLimit('login'), validate({ body: S.LoginBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.login(req.body.email, req.body.password, client(req)));
}));

router.post('/refresh', validate({ body: S.RefreshBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.refresh(req.body.refreshToken, client(req)));
}));

router.post('/logout', validate({ body: S.LogoutBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.logout(req.body.refreshToken));
}));

router.get('/me', authMiddleware, h(async (req, res) => {
  AtaResponse(res, await authService.me(req.authUser!));
}));

router.post('/change-password', authMiddleware, validate({ body: S.ChangePasswordBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.changePassword(req.authUser!, req.body.currentPassword, req.body.newPassword));
}));

router.post('/admin/set-password', authMiddleware, adminAuthMiddleware, validate({ body: S.AdminSetPasswordBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.adminSetPassword(req.body.userId, req.body.newPassword));
}));
// @if register

router.post('/register', authRateLimit('register'), validate({ body: S.RegisterBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.register(req.body));
}));

router.post('/verify-email', authRateLimit('verify-email'), validate({ body: S.VerifyEmailBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.verifyEmail(req.body.email, req.body.code, client(req)));
}));

router.post('/send-otp', authRateLimit('send-otp'), validate({ body: S.SendOtpBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.resendOtp(req.body.email, req.body.purpose));
}));
// @endif
// @if password-reset

router.post('/forgot-password', authRateLimit('forgot-password'), validate({ body: S.ForgotPasswordBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.forgotPassword(req.body.email));
}));

router.post('/reset-password', authRateLimit('reset-password'), validate({ body: S.ResetPasswordBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword));
}));
// @endif
// @if google

router.post('/google', authRateLimit('google'), validate({ body: S.GoogleBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.loginWithGoogle(req.body.idToken, client(req)));
}));
// @endif
// @if apple

router.post('/apple', authRateLimit('apple'), validate({ body: S.AppleBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.loginWithApple(req.body.identityToken, client(req), req.body.fullName, req.body.authorizationCode));
}));
// @endif
// @if google|apple

router.post('/set-password', authMiddleware, authRateLimit('set-password'), validate({ body: S.SetPasswordBodySchema }), h(async (req, res) => {
  AtaResponse(res, await authService.setPassword(req.authUser!, req.body.newPassword));
}));
// @endif
// @if account-delete

router.delete('/account', authMiddleware, h(async (req, res) => {
  AtaResponse(res, await authService.deleteAccount(req.authUser!));
}));
// @endif

// <custom-routes>
// </custom-routes>

export default router;

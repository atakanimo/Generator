import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload, type VerifyOptions } from 'jsonwebtoken';
import { optionalEnv, requireJwtSecret } from '@config/env';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';
import { patchRequestContext } from '@utils/requestContext';

function unauthorized(res: Response, message: string): void {
  AtaResponse(res, {
    isSuccess: false,
    data: null,
    errorData: { header: t('common.unauthorized'), message, code: ErrorCodes.UNAUTHORIZED },
    uiMessage: null
  });
}

function rolesOf(payload: JwtPayload): string[] {
  const role = payload.role ?? payload.roles;
  if (typeof role === 'string') return [role];
  return Array.isArray(role) ? role.filter((r): r is string => typeof r === 'string') : [];
}

/**
 * `Authorization: Bearer <JWT>` (HS256, `JWT_SECRET`; `JWT_ISSUER` / `JWT_AUDIENCE` ayarlıysa denetlenir, `exp` zorunlu).
 * Kullanıcı id'si `userId` ya da `sub` claim'i; roller `role` (string ya da liste).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return unauthorized(res, t('auth.noToken'));
  const options: VerifyOptions = { algorithms: ['HS256'] };
  const issuer = optionalEnv('JWT_ISSUER');
  const audience = optionalEnv('JWT_AUDIENCE');
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;
  try {
    const payload = jwt.verify(header.slice(7), requireJwtSecret(), options) as string | JwtPayload;
    if (typeof payload === 'string' || payload.exp === undefined) return unauthorized(res, t('auth.invalidToken'));
    const userId = typeof payload.userId === 'string' ? payload.userId : payload.sub;
    if (!userId) return unauthorized(res, t('auth.invalidToken'));
    req.userId = userId;
    req.userRoles = rolesOf(payload);
    patchRequestContext({ userId, roles: req.userRoles });
    next();
  } catch {
    unauthorized(res, t('auth.invalidToken'));
  }
}

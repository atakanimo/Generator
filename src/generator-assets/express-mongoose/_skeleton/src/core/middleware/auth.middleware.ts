import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload, type VerifyOptions } from 'jsonwebtoken';
import { optionalEnv, requireJwtSecret } from '@config/env';
import { isMongoConnected } from '@db/connection';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';
import { loadUser } from '@modules/auth/auth.service';
import { patchRequestContext } from '@utils/requestContext';

function fail(res: Response, code: number, header: string, message: string): void {
  AtaResponse(res, { isSuccess: false, data: null, errorData: { header, message, code }, uiMessage: null });
}

/**
 * `Authorization: Bearer <JWT>` (HS256, `JWT_SECRET`; `JWT_ISSUER` / `JWT_AUDIENCE` ayarlıysa denetlenir, `exp` zorunlu).
 * Kullanıcı `sub` claim'inden DB'den okunur: yoksa 401, askıdaysa 403. Rol token'dan değil kayıttan gelir
 * (rol değişikliği / askıya alma hemen geçerli; docs/backend/auth.md "Roller").
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return fail(res, ErrorCodes.UNAUTHORIZED, t('common.unauthorized'), t('auth.noToken'));
  const options: VerifyOptions = { algorithms: ['HS256'] };
  const issuer = optionalEnv('JWT_ISSUER');
  const audience = optionalEnv('JWT_AUDIENCE');
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;
  let userId: string | undefined;
  try {
    const payload = jwt.verify(header.slice(7), requireJwtSecret(), options) as string | JwtPayload;
    if (typeof payload !== 'string' && payload.exp !== undefined) userId = payload.sub;
  } catch {
    userId = undefined;
  }
  if (!userId) return fail(res, ErrorCodes.UNAUTHORIZED, t('common.unauthorized'), t('auth.invalidToken'));
  if (!isMongoConnected()) return fail(res, ErrorCodes.SERVICE_UNAVAILABLE, t('common.failed'), t('common.serviceUnavailable'));
  try {
    const user = await loadUser(userId);
    if (!user) return fail(res, ErrorCodes.UNAUTHORIZED, t('common.unauthorized'), t('auth.invalidToken'));
    if (user.status === 'suspended') return fail(res, ErrorCodes.FORBIDDEN, t('common.forbidden'), t('auth.suspended'));
    req.userId = userId;
    req.authUser = user;
    req.userRoles = [user.role];
    patchRequestContext({ userId, roles: req.userRoles });
    next();
  } catch (error) {
    next(error);
  }
}

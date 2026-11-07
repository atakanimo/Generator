import type { NextFunction, Request, Response } from 'express';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';
import { patchRequestContext } from '@utils/requestContext';

/** `authMiddleware`'den sonra. Admin: kullanıcı kaydının `role` alanı `admin`. Değilse 403. */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    return AtaResponse(res, {
      isSuccess: false,
      data: null,
      errorData: { header: t('common.unauthorized'), message: t('auth.noToken'), code: ErrorCodes.UNAUTHORIZED },
      uiMessage: null
    });
  }
  if (req.authUser.role !== 'admin') {
    return AtaResponse(res, {
      isSuccess: false,
      data: null,
      errorData: { header: t('common.forbidden'), message: t('common.forbidden'), code: ErrorCodes.FORBIDDEN },
      uiMessage: null
    });
  }
  patchRequestContext({ isAdmin: true });
  next();
}

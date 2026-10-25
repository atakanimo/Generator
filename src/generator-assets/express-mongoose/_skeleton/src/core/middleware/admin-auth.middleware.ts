import type { NextFunction, Request, Response } from 'express';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';
import { patchRequestContext } from '@utils/requestContext';

/**
 * `authMiddleware`'den sonra. Admin: token rolü `ADMIN_ROLE`'ü (varsayılan `admin`) içerir ya da kullanıcı id'si
 * `ADMIN_USER_IDS`'te (virgülle). Değilse 403.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userId = req.userId;
  if (!userId) {
    return AtaResponse(res, {
      isSuccess: false,
      data: null,
      errorData: { header: t('common.unauthorized'), message: t('auth.noToken'), code: ErrorCodes.UNAUTHORIZED },
      uiMessage: null
    });
  }
  const adminRole = process.env.ADMIN_ROLE?.trim() || 'admin';
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!(req.userRoles ?? []).includes(adminRole) && !adminIds.includes(userId)) {
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

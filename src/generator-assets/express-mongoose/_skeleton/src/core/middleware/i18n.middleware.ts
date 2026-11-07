import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_LANGUAGE } from '@config/i18n';
import { normalizeLanguage } from '@helpers/i18n.helper';
import { patchRequestContext } from '@utils/requestContext';

/** İstek dili yalnız `Accept-Language` (api-contract K6); yoksa / desteklenmiyorsa varsayılan. */
export function i18nMiddleware(req: Request, _res: Response, next: NextFunction): void {
  patchRequestContext({ language: normalizeLanguage(req.get('accept-language')) ?? DEFAULT_LANGUAGE });
  next();
}

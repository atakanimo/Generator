import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_LANGUAGE } from '@config/i18n';
import { normalizeLanguage } from '@helpers/i18n.helper';
import { patchRequestContext } from '@utils/requestContext';

/** İstek dili: `lang` / `x-lang` başlığı, `?lang=`, `Accept-Language`; yoksa varsayılan (`tr`). */
export function i18nMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const query = typeof req.query.lang === 'string' ? req.query.lang : undefined;
  const language =
    normalizeLanguage(req.get('lang')) ??
    normalizeLanguage(req.get('x-lang')) ??
    normalizeLanguage(query) ??
    normalizeLanguage(req.get('accept-language')) ??
    DEFAULT_LANGUAGE;
  patchRequestContext({ language });
  next();
}

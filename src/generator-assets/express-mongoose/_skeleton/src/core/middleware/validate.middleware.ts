import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';

export type ValidateSchemas = {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
};

/** Route girişlerini Zod ile doğrular; hata 400 + sözleşme zarfı (üretilen route'lar `@core`'dan alır). */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      if (!(error instanceof z.ZodError)) return next(error);
      const message = error.errors.map((e) => `${e.path.join('.') || 'root'}: ${e.message}`).join('; ');
      AtaResponse(res, {
        isSuccess: false,
        data: null,
        errorData: { header: t('common.badRequest'), message, code: ErrorCodes.BAD_REQUEST },
        uiMessage: null
      });
    }
  };
}

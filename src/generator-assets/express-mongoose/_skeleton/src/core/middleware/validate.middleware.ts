import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';

export type ValidateSchemas = {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
};

function jsonPath(path: (string | number)[]): string | undefined {
  const value = path.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part), '');
  return value || undefined;
}

/** Route girişlerini Zod ile doğrular; hata 400 + sözleşme zarfı (üretilen route'lar `@core`'dan alır). */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, res, next) => {
    let source: keyof ValidateSchemas = 'body';
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      source = 'query';
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      source = 'params';
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      if (!(error instanceof z.ZodError)) return next(error);
      const message = error.errors.map((e) => `${e.path.join('.') || 'root'}: ${e.message}`).join('; ');
      const field = source === 'body' ? jsonPath(error.errors[0]?.path ?? []) : undefined;
      AtaResponse(res, {
        isSuccess: false,
        data: null,
        errorData: { header: t('common.badRequest'), message, code: ErrorCodes.BAD_REQUEST, ...(field ? { field } : {}) },
        uiMessage: null
      });
    }
  };
}

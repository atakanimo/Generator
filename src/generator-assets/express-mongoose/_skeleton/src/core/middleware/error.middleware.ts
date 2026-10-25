import type { NextFunction, Request, Response } from 'express';
import { HandleServiceError } from '@core/errors/error.helper';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';

/** Tanımsız yol: 404, sözleşme zarfıyla. Router bağlamalarından sonra. */
export function notFoundHandler(req: Request, res: Response): void {
  AtaResponse(res, {
    isSuccess: false,
    data: null,
    errorData: { header: t('common.notFound'), message: `${req.method} ${req.path}`, code: ErrorCodes.NOT_FOUND },
    uiMessage: null
  });
}

/** Bozuk JSON gövdesi 400; diğer yakalanmamış hatalar `HandleServiceError` ile zarfa (çoğu 500). */
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && 'body' in error) {
    return AtaResponse(res, {
      isSuccess: false,
      data: null,
      errorData: { header: t('common.badRequest'), message: t('common.invalidJson'), code: ErrorCodes.BAD_REQUEST },
      uiMessage: null
    });
  }
  AtaResponse(res, HandleServiceError(error));
}

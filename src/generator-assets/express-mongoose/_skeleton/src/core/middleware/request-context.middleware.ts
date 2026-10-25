import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '@utils/requestContext';

/** İstek bağlamı (`requestIdMiddleware`'den sonra): requestId, yöntem, url, ip; auth ve dil sonradan eklenir. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  runWithRequestContext(
    {
      requestId: req.requestId ?? 'unknown',
      startedAtMs: Date.now(),
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      isAdmin: false
    },
    () => next()
  );
}

import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const MAX_REQUEST_ID_LENGTH = 128;

/** İstemcinin `X-Request-Id`'si (yoksa eski `X-Trace-Id`; 128 karakterden uzunsa yok sayılır) ya da yeni UUID. */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = (req.get('x-request-id') ?? req.get('x-trace-id'))?.trim();
  req.requestId = header && header.length <= MAX_REQUEST_ID_LENGTH ? header : randomUUID();
  next();
}

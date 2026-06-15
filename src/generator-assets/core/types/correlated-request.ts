import type { Request } from 'express';
import type { Logger } from 'pino';

/**
 * `requestIdMiddleware` / `requestLoggerMiddleware` ile gelen alanlar.
 * Global `express-request.d.ts` ile aynı şekil; burada tekrarlanması ts-node’un
 * program grafiğinde merge sırasından bağımsız güvenli tip sağlar.
 */
export type CorrelatedRequest = Request & {
  requestId?: string;
  logger?: Logger;
};

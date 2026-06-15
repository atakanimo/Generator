/** Express `Request` genişletmesi — `src/core/types/` (middleware ile aynı katman). */
import type { Logger } from 'pino';

export {};

declare global {
  namespace Express {
    interface Request {
      /** `x-request-id` veya sunucunun ürettiği kimlik — `requestIdMiddleware`. */
      requestId?: string;
      /** Pino child — `requestLoggerMiddleware` (tasks §10.2). */
      logger?: Logger;
    }
  }
}

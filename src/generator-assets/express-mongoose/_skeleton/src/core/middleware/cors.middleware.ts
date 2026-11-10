import cors from 'cors';
import { isProduction } from '@config/env';

function allowedOrigins(): Set<string> {
  return new Set((process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

/** Üretimde yalnız `CORS_ORIGINS`; geliştirmede her origin. `X-Request-Id` istemciye açılır. */
export const corsMiddleware = cors({
  origin(origin, callback) {
    callback(null, !origin || !isProduction() || allowedOrigins().has(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'Accept', 'Accept-Language'],
  exposedHeaders: ['X-Request-Id', 'Retry-After'],
  optionsSuccessStatus: 204
});

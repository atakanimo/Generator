import type { RequestHandler } from 'express';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';

/**
 * In-memory fixed window per IP and route (one process). Behind several instances put a shared limiter (Redis,
 * proxy) in front; the contract stays the same: 429 + envelope.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${options.key ?? req.path}:${req.ip ?? 'unknown'}`;
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return next();
    }
    entry.count += 1;
    if (entry.count <= options.max) return next();
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    AtaResponse(res, {
      isSuccess: false,
      data: null,
      errorData: { header: t('common.failed'), message: t('auth.tooManyRequests'), code: ErrorCodes.TOO_MANY_REQUESTS },
      uiMessage: null
    });
  };
}

/** Limit used on login / register / OTP / forgot-password (`AUTH_RATE_LIMIT_PER_MINUTE`, default 10). */
export function authRateLimit(key: string): RequestHandler {
  return rateLimit({ windowMs: 60_000, max: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10), key });
}

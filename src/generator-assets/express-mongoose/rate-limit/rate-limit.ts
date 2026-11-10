import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { type JwtPayload, type VerifyOptions } from 'jsonwebtoken';
import { optionalEnv, requireJwtSecret } from '@config/env';
import { AtaResponse, ErrorCodes } from '@core/response/response.helper';
import { t } from '@helpers';
import { customRateLimitPolicies } from './rate-limit.policies';

export type RateLimitKey = 'ip' | 'user' | 'ip-path' | 'header';

export interface RateLimitPolicy {
  name: string;
  limit: string;
  key: RateLimitKey;
  path: RegExp;
  methods?: readonly string[];
  keyHeader?: string;
  ipCeiling?: string;
}

interface Limit {
  count: number;
  windowMs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

interface ResolvedPolicy {
  policy: RateLimitPolicy;
  limit: Limit | null;
  ceiling: Limit | null;
}

export const authRateLimitPolicy: RateLimitPolicy = {
  name: 'auth',
  limit: '10/60',
  key: 'ip-path',
  methods: ['POST'],
  path: /^\/api\/auth\/(login|register|verify-email|send-otp|forgot-password|reset-password|google|apple|set-password)\/?$/i
};

const ADMIN_PATH = /^\/api\/(admin(\/|$)|[^/]+\/admin(\/|$))/i;
const MAX_WINDOWS = 10_000;

function envName(name: string): string {
  return `RATE_LIMIT_${name.toUpperCase().replace(/-/g, '_')}`;
}

function readLimit(key: string, defaultValue: string): Limit | null {
  if (optionalEnv('RATE_LIMIT_ENABLED')?.toLowerCase() === 'false') return null;
  const value = optionalEnv(key) ?? defaultValue;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match || Number(match[2]) === 0) throw new Error(`${key} '<adet>/<saniye>' biçiminde olmalı: ${value}`);
  const count = Number(match[1]);
  return count === 0 ? null : { count, windowMs: Number(match[2]) * 1000 };
}

export function trustedProxies(): string[] {
  return (optionalEnv('TRUSTED_PROXY_CIDRS') ?? '127.0.0.1/32,::1/128')
    .split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean);
}

function userId(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  const options: VerifyOptions = { algorithms: ['HS256'] };
  const issuer = optionalEnv('JWT_ISSUER');
  const audience = optionalEnv('JWT_AUDIENCE');
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;
  try {
    const payload = jwt.verify(header.slice(7), requireJwtSecret(), options) as string | JwtPayload;
    return typeof payload === 'string' ? undefined : payload.sub;
  } catch {
    return undefined;
  }
}

function partitionKey(req: Request, key: RateLimitKey, keyHeader?: string): string | null {
  const ip = `ip:${req.ip ?? 'unknown'}`;
  switch (key) {
    case 'ip-path':
      return `${ip}|${req.path}`;
    case 'user': {
      const id = userId(req);
      return id ? `user:${id}` : ip;
    }
    case 'header': {
      const value = keyHeader ? req.get(keyHeader)?.trim() : undefined;
      return value ? `key:${value}` : null;
    }
    default:
      return ip;
  }
}

function resolve(policy: RateLimitPolicy): ResolvedPolicy {
  if (policy.key === 'header' && (!policy.keyHeader || !policy.ipCeiling)) {
    throw new Error(`${policy.name}: 'header' anahtarı keyHeader ve ipCeiling ister.`);
  }
  const name = envName(policy.name);
  return {
    policy,
    limit: readLimit(name, policy.limit),
    ceiling: policy.ipCeiling ? readLimit(`${name}_IP`, policy.ipCeiling) : null
  };
}

function reject(res: Response, retryAfterSeconds: number): void {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  AtaResponse(res, {
    isSuccess: false,
    data: null,
    errorData: { header: t('rateLimit.tooManyRequests'), message: t('rateLimit.retryLater'), code: ErrorCodes.TOO_MANY_REQUESTS },
    uiMessage: null
  });
}

export function createRateLimitMiddleware(): RequestHandler {
  const general = readLimit('RATE_LIMIT_GENERAL', '120/60');
  const adminRead = readLimit('RATE_LIMIT_ADMIN_READ', '600/900');
  const adminWrite = readLimit('RATE_LIMIT_ADMIN_WRITE', '120/900');
  const policies = [authRateLimitPolicy, ...customRateLimitPolicies].map(resolve);
  const windows = new Map<string, Window>();

  const hit = (key: string, limit: Limit): number => {
    const now = Date.now();
    const entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + limit.windowMs });
      if (windows.size > MAX_WINDOWS) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
      return 0;
    }
    entry.count += 1;
    return entry.count <= limit.count ? 0 : Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path;
    if (!path.toLowerCase().startsWith('/api/') || req.method === 'OPTIONS' || path.toLowerCase() === '/api/health') return next();

    const matched = policies.find(({ policy }) => policy.path.test(path) && (!policy.methods || policy.methods.includes(req.method)));
    if (matched) {
      const { policy, limit, ceiling } = matched;
      const ceilingWait = ceiling ? hit(`ceiling:${policy.name}|${partitionKey(req, 'ip')}`, ceiling) : 0;
      if (ceilingWait) return reject(res, ceilingWait);
      const key = limit ? partitionKey(req, policy.key, policy.keyHeader) : null;
      const wait = key && limit ? hit(`${policy.name}|${key}`, limit) : 0;
      return wait ? reject(res, wait) : next();
    }

    let profile = 'general';
    let limit = general;
    if (ADMIN_PATH.test(path)) {
      const read = req.method === 'GET' || req.method === 'HEAD' || /\/get-all\/?$/i.test(path);
      profile = read ? 'admin-read' : 'admin-write';
      limit = read ? adminRead : adminWrite;
    }
    if (!limit) return next();
    const wait = hit(`${profile}|${partitionKey(req, 'user')}`, limit);
    return wait ? reject(res, wait) : next();
  };
}

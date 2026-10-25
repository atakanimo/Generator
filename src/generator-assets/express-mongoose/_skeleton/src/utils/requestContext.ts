import { AsyncLocalStorage } from 'async_hooks';
import type { Response } from 'express';

/**
 * İstek başına tek bağlam (AsyncLocalStorage): `requestContextMiddleware` kurar, auth / i18n middleware'leri günceller.
 * Generator asset'leri (`@core/**`) `getRequestContext`, `getCurrentUserId`, `applyRequestIdToResponse` kullanır.
 */
export type RequestContextState = {
  requestId: string;
  startedAtMs: number;
  method: string;
  url: string;
  ip?: string;
  language?: string;
  userId?: string;
  roles?: string[];
  isAdmin?: boolean;
};

const storage = new AsyncLocalStorage<RequestContextState>();

export function runWithRequestContext(state: RequestContextState, next: () => void): void {
  storage.run(state, next);
}

export function getRequestContext(): RequestContextState | undefined {
  return storage.getStore();
}

export function patchRequestContext(partial: Partial<Omit<RequestContextState, 'requestId' | 'startedAtMs'>>): void {
  const state = storage.getStore();
  if (state) Object.assign(state, partial);
}

export function getCurrentUserId(): string | undefined {
  return storage.getStore()?.userId;
}

/** Yanıta `X-Request-Id` (sözleşme `traceId` ile aynı değer). */
export function applyRequestIdToResponse(res: Response): void {
  const requestId = storage.getStore()?.requestId;
  if (requestId) res.setHeader('X-Request-Id', requestId);
}

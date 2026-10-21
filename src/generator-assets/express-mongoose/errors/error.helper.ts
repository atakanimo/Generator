import type { IApiResponse } from '@core/types/api-contract';
import mongoose from 'mongoose';
import { JsonWebTokenError, NotBeforeError, TokenExpiredError } from 'jsonwebtoken';
import { t } from '@helpers';
import { getRequestContext } from '@utils/requestContext';
import { getAppLogger } from '@core/logging/logger';
import { ErrorCodes, type ErrorCodeKey } from '@core/errors/error-codes';

export { ErrorCodes } from '@core/errors/error-codes';

function isMongoDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: number }).code;
  if (code === 11000) {
    return true;
  }
  if (error instanceof Error && error.message.includes('E11000')) {
    return true;
  }
  return false;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const status = (error as { statusCode?: number }).statusCode;
  const name = (error as { name?: string }).name;
  if (status === 429) {
    return true;
  }
  if (name === 'RateLimitError') {
    return true;
  }
  return false;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: string }).code;
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    return true;
  }
  if (error instanceof Error && /timeout|timed out|AbortError/i.test(error.message)) {
    return true;
  }
  return false;
}

function isMongoUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = (error as { name?: string }).name;
  if (
    name === 'MongoNetworkError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoPoolClearedError' ||
    name === 'MongoWaitQueueTimeoutError'
  ) {
    return true;
  }
  const msg = error instanceof Error ? error.message : '';
  if (/Topology is closed|connection.*closed|not connected|ECONNREFUSED|ECONNRESET/i.test(msg)) {
    return true;
  }
  return false;
}

function isJwtAuthError(error: unknown): boolean {
  return (
    error instanceof JsonWebTokenError ||
    error instanceof TokenExpiredError ||
    error instanceof NotBeforeError
  );
}

function isMongooseValidationError(error: unknown): error is Error {
  return typeof mongoose !== 'undefined' && error instanceof mongoose.Error.ValidationError;
}

function isMongooseCastError(error: unknown): error is Error {
  return typeof mongoose !== 'undefined' && error instanceof mongoose.Error.CastError;
}

/**
 * Servis katmanında yakalanan hatayı `IApiResponse` şekline çevirir; loglar (request bağlamı + stack).
 * `instanceof Error` tek başına yeterli değildir — CodeStandarts.md §5.
 */
function logHandleServiceError(payload: {
  codeKey: ErrorCodeKey;
  message: string;
  stack?: string;
  context?: string;
}): void {
  const ctx = getRequestContext();
  getAppLogger().error({
    event: 'handleServiceError',
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    normalizedCode: payload.codeKey,
    message: payload.message.replace(/\s+/g, ' ').slice(0, 2000),
    stack: payload.stack?.slice(0, 8000),
    context: payload.context
  });
}

export function HandleServiceError<T = null>(
  error: unknown,
  options?: { fallbackMessage?: string; fallbackHeader?: string; context?: string }
): IApiResponse<T> {
  const fallbackHeader = options?.fallbackHeader ?? t('common.error');
  const fallbackMessage = options?.fallbackMessage ?? t('common.internalServerError');

  let header = fallbackHeader;
  let message = fallbackMessage;
  let codeKey: ErrorCodeKey = 'INTERNAL_SERVER_ERROR';

  if (error == null) {
    const stack = 'null/undefined error';
    logHandleServiceError({
      codeKey,
      message,
      stack,
      context: options?.context
    });
    return {
      isSuccess: false,
      data: null,
      errorData: { header, message, code: ErrorCodes[codeKey] },
      uiMessage: null
    };
  }

  if (isMongooseValidationError(error)) {
    codeKey = 'BAD_REQUEST';
    message = error.message;
    header = t('common.failed');
  } else if (isMongooseCastError(error)) {
    codeKey = 'BAD_REQUEST';
    message = error.message;
    header = t('common.failed');
  } else if (isMongoDuplicateKey(error)) {
    codeKey = 'CONFLICT';
    message = t('common.duplicateValue');
  } else if (isJwtAuthError(error)) {
    codeKey = 'UNAUTHORIZED';
    message = error instanceof Error ? error.message : fallbackMessage;
    header = t('common.unauthorized');
  } else if (isRateLimitError(error)) {
    codeKey = 'TOO_MANY_REQUESTS';
    message = error instanceof Error ? error.message : t('rateLimit.tooManyRequests');
    header = t('rateLimit.tooManyRequests');
  } else if (isTimeoutError(error)) {
    codeKey = 'REQUEST_TIMEOUT';
    message = error instanceof Error ? error.message : 'Request timeout';
  } else if (isMongoUnavailable(error)) {
    codeKey = 'SERVICE_UNAVAILABLE';
    message = error instanceof Error ? error.message : 'Database unavailable';
  } else if (error instanceof Error) {
    message = options?.fallbackMessage ?? error.message;
    if (error.message.includes('E11000')) {
      codeKey = 'CONFLICT';
      message = t('common.duplicateValue');
    }
  }

  const stack = error instanceof Error ? error.stack ?? error.message : String(error);
  logHandleServiceError({
    codeKey,
    message,
    stack,
    context: options?.context
  });

  return {
    isSuccess: false,
    data: null,
    errorData: { header, message, code: ErrorCodes[codeKey] },
    uiMessage: null
  };
}

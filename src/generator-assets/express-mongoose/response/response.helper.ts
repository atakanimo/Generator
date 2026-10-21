import type { Response } from 'express';
import type { IApiResponse, IErrorData } from '@core/types/api-contract';
import { t } from '@helpers';
import { applyRequestIdToResponse, getRequestContext } from '@utils/requestContext';
import { getAppLogger } from '@core/logging/logger';
import { HandleServiceError } from '@core/errors/error.helper';
import { ErrorCodes, type ErrorCodeKey } from '@core/errors/error-codes';
import { toWire } from '@core/response/wire';

export { ErrorCodes, type ErrorCodeKey } from '@core/errors/error-codes';
export { HandleServiceError } from '@core/errors/error.helper';

type ErrorData = Omit<IErrorData, 'code'> & { code?: ErrorCodeKey };

/**
 * JSON API yanıtı — süre / `X-Request-Id` / yapılandırılmış log (tasks §10).
 * `data` her cevapta `toWire`'dan geçer: `_id` → `id`, `Decimal128` → string (sözleşme K1, K5).
 */
export const AtaResponse = <T>(res: Response, response: IApiResponse<T>) => {
  applyRequestIdToResponse(res);
  const statusCode = response.isSuccess
    ? 200
    : response.errorData?.code
      ? (response.errorData.code as unknown as number)
      : 500;
  const ctx = getRequestContext();
  const durationMs = ctx?.startedAtMs != null ? Date.now() - ctx.startedAtMs : undefined;
  getAppLogger().info({
    event: 'http.response',
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    statusCode,
    isSuccess: response.isSuccess,
    errorCode: response.errorData?.code ?? null,
    durationMs
  });
  res.status(statusCode).json({ ...response, data: toWire(response.data) });
};

export const SuccessResponse = <T>(data: T, uiMessage?: string): IApiResponse<T> => {
  return { isSuccess: true, data, uiMessage: uiMessage || t('common.success'), errorData: null };
};

export const ErrorResponse = <T>(errorData: ErrorData): IApiResponse<T> => {
  const { header, message, code = 'BAD_REQUEST' } = errorData;

  const ctx = getRequestContext();
  getAppLogger().warn({
    event: 'http.errorResponse',
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    code,
    header: header || t('common.failed'),
    message: typeof message === 'string' ? message.slice(0, 2000) : message
  });
  return {
    isSuccess: false,
    data: null,
    errorData: { header: header || t('common.failed'), message, code: ErrorCodes[code as ErrorCodeKey] },
    uiMessage: null
  };
};

export const InternalServerErrorResponse = <T>(error?: unknown, customMessage?: string, customHeader?: string): IApiResponse<T> => {
  return HandleServiceError<T>(error, {
    fallbackMessage: customMessage,
    fallbackHeader: customHeader,
    context: 'InternalServerErrorResponse'
  });
};

/**
 * API JSON dışı düz metin (`app-ads.txt` vb.). `X-Request-Id` korunur (tasks §11.1).
 */
export function sendPlainTextResponse(res: Response, statusCode: number, body: string): void {
  applyRequestIdToResponse(res);
  res.status(statusCode).type('text/plain; charset=utf-8').send(body);
}

/**
 * API JSON dışı HTML (`/privacy` vb.). `X-Request-Id` korunur (tasks §11.1).
 */
export function sendHtmlResponse(res: Response, statusCode: number, html: string): void {
  applyRequestIdToResponse(res);
  res.status(statusCode).type('text/html; charset=utf-8').send(html);
}

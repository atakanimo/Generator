/**
 * HTTP / domain yanıt kodları — `AtaResponse` ve `IApiResponse.errorData.code` ile uyumlu.
 * Tek kaynak: `response.helper` / servis hata yardımcıları buradan import eder.
 */
export const ErrorCodes = {
  INTERNAL_SERVER_ERROR: 500,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  REQUEST_TIMEOUT: 408,
  SERVICE_UNAVAILABLE: 503,
  EMAIL_NOT_VERIFIED: 463
} as const;

export type ErrorCodeKey = keyof typeof ErrorCodes;

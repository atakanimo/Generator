import type { InternalAxiosRequestConfig } from 'axios';

export interface ErrorData {
  header: string;
  message: string;
  code: number;
  field?: string;
}

export interface LocalResponse<T> {
  isSuccess: boolean;
  data: T;
  uiMessage: string;
  errorData: ErrorData | null;
  statusCode?: number;
  traceId?: string;
  fileName?: string;
}

export interface ApiHooks {
  onRequest?: (config: InternalAxiosRequestConfig) => LocalResponse<null> | void;
  onResponseHeaders?: (headers: Record<string, unknown>) => void;
  onError?: (response: LocalResponse<null>, config?: InternalAxiosRequestConfig) => boolean | void;
}

export type ApiDispatch = (action: never) => unknown;

export interface ApiAuth {
  getAccessToken: (state: unknown) => string | null | undefined | Promise<string | null | undefined>;
  hasSession: (state: unknown) => boolean;
  refreshSessionOnce: (dispatch: ApiDispatch) => Promise<boolean>;
  isAuthRequest: (url: string | undefined) => boolean;
}

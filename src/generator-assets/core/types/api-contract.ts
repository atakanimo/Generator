/**
 * HTTP API genel yanıt sözleşmesi — `AtaResponse` / servis dönüşleri ile uyumlu.
 * CodeStandarts §2 (paylaşılan): **`src/core/types/`**, domain **`*.types.ts`** değildir.
 */
export interface IErrorData {
  header?: string;
  message: string;
  code?: number;
}

export interface IApiResponse<T> {
  data?: T | null;
  isSuccess: boolean;
  uiMessage: string | null;
  errorData: IErrorData | null;
}

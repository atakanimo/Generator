/**
 * Error Handler Utility
 * Centralized error handling with user-friendly messages and logging
 */

import { log } from './logger.js';

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // Validation errors
  INVALID_PATH = 'INVALID_PATH',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  INVALID_SOURCE_TYPE = 'INVALID_SOURCE_TYPE',
  INVALID_ENTITY_NAME = 'INVALID_ENTITY_NAME',
  INVALID_FIELD_NAME = 'INVALID_FIELD_NAME',

  // Template errors
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TEMPLATE_COMPILE_ERROR = 'TEMPLATE_COMPILE_ERROR',
  TEMPLATE_RENDER_ERROR = 'TEMPLATE_RENDER_ERROR',

  // Generation errors
  GENERATION_FAILED = 'GENERATION_FAILED',
  INJECTION_FAILED = 'INJECTION_FAILED',

  // Parsing errors
  PARSE_ERROR = 'PARSE_ERROR',
  INVALID_MODEL_FILE = 'INVALID_MODEL_FILE',

  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Structured error interface
 */
export interface AppError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  originalError?: Error;
  context?: Record<string, any>;
}

/**
 * Create a structured error
 */
export function createError(
  code: ErrorCode,
  message: string,
  originalError?: Error,
  context?: Record<string, any>
): AppError {
  const userMessage = getUserFriendlyMessage(code, message, context);

  return {
    code,
    message,
    userMessage,
    originalError,
    context
  };
}

/**
 * Get user-friendly error message based on error code
 */
function getUserFriendlyMessage(
  code: ErrorCode,
  technicalMessage: string,
  context?: Record<string, any>
): string {
  const filePath = context?.filePath || '';
  const entityName = context?.entityName || '';

  switch (code) {
    case ErrorCode.FILE_NOT_FOUND:
      return `Dosya bulunamadı: ${filePath}\nDosya yolunu kontrol edin.`;

    case ErrorCode.FILE_READ_ERROR:
      return `Dosya okunamadı: ${filePath}\nDosya izinlerini kontrol edin.`;

    case ErrorCode.FILE_WRITE_ERROR:
      return `Dosya yazılamadı: ${filePath}\nDizin izinlerini kontrol edin veya yönetici olarak çalıştırın.`;

    case ErrorCode.DIRECTORY_NOT_FOUND:
      return `Dizin bulunamadı: ${filePath}\nProje yolunun doğru olduğundan emin olun.`;

    case ErrorCode.PERMISSION_DENIED:
      return `İzin hatası: ${filePath}\nDosya veya dizin izinlerini kontrol edin.`;

    case ErrorCode.INVALID_PATH:
      return `Geçersiz yol: ${filePath}\nLütfen geçerli bir proje yolu seçin.`;

    case ErrorCode.INVALID_SCHEMA:
      return `Geçersiz schema: ${entityName}\nSchema yapısını kontrol edin.`;

    case ErrorCode.INVALID_SOURCE_TYPE:
      return 'Geçersiz kaynak tipi.\nNode.js (Mongoose/TypeORM) veya .NET seçin.';

    case ErrorCode.INVALID_ENTITY_NAME:
      return `Geçersiz entity ismi: ${entityName}\nEntity ismi büyük harfle başlamalı ve sadece harf, rakam içermelidir.`;

    case ErrorCode.INVALID_FIELD_NAME:
      return `Geçersiz field ismi.\nField ismi küçük harfle başlamalı ve sadece harf, rakam, underscore içermelidir.`;

    case ErrorCode.TEMPLATE_NOT_FOUND:
      return `Template bulunamadı.\nTemplate dosyalarının mevcut olduğundan emin olun.`;

    case ErrorCode.TEMPLATE_COMPILE_ERROR:
      return `Template derlenirken hata oluştu.\nTemplate syntax'ını kontrol edin.`;

    case ErrorCode.TEMPLATE_RENDER_ERROR:
      return `Template render edilirken hata oluştu.\nSchema verilerini kontrol edin.`;

    case ErrorCode.GENERATION_FAILED:
      return `Kod üretimi başarısız oldu: ${entityName}\nLütfen tekrar deneyin.`;

    case ErrorCode.INJECTION_FAILED:
      return `Kod enjeksiyonu başarısız oldu.\nHedef dosyaların yapısını kontrol edin.`;

    case ErrorCode.PARSE_ERROR:
      return `Model dosyası parse edilemedi: ${filePath}\nDosyanın geçerli bir model dosyası olduğundan emin olun.`;

    case ErrorCode.INVALID_MODEL_FILE:
      return `Geçersiz model dosyası: ${filePath}\nDosya isminde "model" kelimesi olmalı ve geçerli bir Schema içermelidir.`;

    case ErrorCode.UNKNOWN_ERROR:
    default:
      return `Bilinmeyen bir hata oluştu.\nHata: ${technicalMessage}\nLütfen tekrar deneyin veya log dosyalarını kontrol edin.`;
  }
}

/**
 * Handle and log an error, return structured error
 */
export function handleError(
  error: Error | string,
  code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  context?: Record<string, any>
): AppError {
  const message = typeof error === 'string' ? error : error.message;
  const originalError = typeof error === 'string' ? undefined : error;

  const appError = createError(code, message, originalError, context);

  // Log error
  log(
    `[${appError.code}] ${appError.message}${context ? ` | Context: ${JSON.stringify(context)}` : ''}`,
    'error'
  );

  return appError;
}

/**
 * Convert error to result object (for IPC responses)
 */
export function errorToResult(error: AppError): {
  success: false;
  error: string;
  code: ErrorCode;
} {
  return {
    success: false,
    error: error.userMessage,
    code: error.code
  };
}

/**
 * Wrap a function with error handling
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => T,
  errorCode: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  context?: Record<string, any>
): (...args: Args) => T | AppError {
  return (...args: Args) => {
    try {
      return fn(...args);
    } catch (error) {
      return handleError(error as Error, errorCode, context);
    }
  };
}

/**
 * Wrap an async function with error handling
 */
export function withAsyncErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  errorCode: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  context?: Record<string, any>
): (...args: Args) => Promise<T | AppError> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleError(error as Error, errorCode, context);
    }
  };
}

/**
 * Check if result is an error
 */
export function isError(result: any): result is AppError {
  return result && typeof result === 'object' && 'code' in result && 'userMessage' in result;
}

/**
 * Map system errors to error codes
 */
export function mapSystemError(systemError: NodeJS.ErrnoException): ErrorCode {
  switch (systemError.code) {
    case 'ENOENT':
      return ErrorCode.FILE_NOT_FOUND;
    case 'EACCES':
    case 'EPERM':
      return ErrorCode.PERMISSION_DENIED;
    case 'EISDIR':
      return ErrorCode.INVALID_PATH;
    case 'ENOTDIR':
      return ErrorCode.INVALID_PATH;
    default:
      return ErrorCode.UNKNOWN_ERROR;
  }
}


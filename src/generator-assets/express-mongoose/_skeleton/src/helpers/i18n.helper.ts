import i18next, { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@config/i18n';
import { getRequestContext } from '@utils/requestContext';

/** İsteğin dili (`i18nMiddleware` istek bağlamına yazar); istek dışında varsayılan dil. */
export function getCurrentLanguage(): string {
  return getRequestContext()?.language ?? DEFAULT_LANGUAGE;
}

/** `Accept-Language` değerini desteklenen dile indirger (`en-US` → `en`); bilinmeyen → undefined. */
export function normalizeLanguage(value: string | undefined): string | undefined {
  const code = value?.split(',')[0]?.split(/[-_;]/)[0]?.trim().toLowerCase();
  return code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code) ? code : undefined;
}

/** Çeviri: isteğin dilinde (`src/locales/<dil>.ts`). */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.getFixedT(getCurrentLanguage())(key, options) as string;
}

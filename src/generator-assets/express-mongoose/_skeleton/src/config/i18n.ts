import i18next from 'i18next';
import en from '@locales/en';
import tr from '@locales/tr';

export const SUPPORTED_LANGUAGES = ['en', 'tr'] as const;
export const DEFAULT_LANGUAGE = 'en';

void i18next.init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  initImmediate: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  showSupportNotice: false
});

export default i18next;

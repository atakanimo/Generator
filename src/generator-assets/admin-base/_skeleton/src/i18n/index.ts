import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { adminBaseTexts, adminBaseTextsEn } from '@atakanimo/ata-admin-base';

import { en } from './locales/en';
import { tr } from './locales/tr';

// `ataAdmin.*`: @atakanimo/ata-admin-base texts (tables, forms, login, layout) in both languages.
const resources = {
  en: {
    translation: { ...en, ...adminBaseTextsEn }
  },
  tr: {
    translation: { ...tr, ...adminBaseTexts }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'tr',
    supportedLngs: ['tr', 'en'],
    debug: false,
    interpolation: {
      escapeValue: false
    }
  });

// `<html lang>` dili izler: MUI büyük harf dönüşümü (buton metinleri) dile göre yapılır ("Light" → tr'de "LİGHT").
const syncHtmlLang = (lng: string) => document.documentElement.setAttribute('lang', lng?.startsWith('tr') ? 'tr' : 'en');
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

/** Üst bar / login dil düğmesi: tr ↔ en (seçim tarayıcıda saklanır, LanguageDetector). */
export const toggleLanguage = () => void i18n.changeLanguage(i18n.language?.startsWith('tr') ? 'en' : 'tr');

export default i18n;

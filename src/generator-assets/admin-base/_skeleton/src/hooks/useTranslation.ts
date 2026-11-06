import { en } from '@/i18n/locales/en';
import { useTranslation } from 'react-i18next';

type Translations = typeof en;
export type Keys = keyof Translations & string;
export type SubKeys<T extends Keys> = keyof Translations[T] & string;

const useCustomTranslation = () => {
  const { t } = useTranslation();

  const customTranslate = <T extends Keys, K extends SubKeys<T>>(key: T, subKey: K, options?: Record<string, string>) => {
    const prefix = `${key}.${subKey}`;
    return t(prefix, options);
  };

  return { customTranslate };
};

export default useCustomTranslation;

// Mobil platform adaptörü: API adresi, mesajlar ve token saklama.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InfoAlert } from '@/components/Core/Alert';
import type { ErrorData } from '@/types';
import { API_URL } from '@env';
import i18next from 'i18next';
import { Platform } from 'react-native';

/** Android emulator'da localhost yerine 10.0.2.2. */
export const BASE_URL: string = Platform.OS === 'android' && API_URL.includes('localhost') ? API_URL.replace('localhost', '10.0.2.2') : API_URL;

/** Mobil başarı mesajını ekran gösterir; interceptor basmaz. */
export const showSuccessMessage = (_message: string) => {};

const ALERT_DEDUPE_MS = 4000;
const isReloginRequiredText = (value: string) => /reloginrequired/i.test(value);
let lastAlertKey = '';
let lastAlertAt = 0;

/** Aynı uyarı 4 sn içinde bir kez. */
export const showErrorMessage = ({ header, message }: ErrorData) => {
  const isReloginRequired = isReloginRequiredText(header) || isReloginRequiredText(message);
  const title = isReloginRequired ? i18next.t('auth.reloginRequiredTitle') : header;
  const body = isReloginRequired ? i18next.t('auth.reloginRequired') : message;
  const key = `${title}|${body}`;
  const now = Date.now();
  if (key === lastAlertKey && now - lastAlertAt < ALERT_DEDUPE_MS) return;
  lastAlertKey = key;
  lastAlertAt = now;
  InfoAlert({ title, message: body });
};

/** Telefon oturumu hep saklar: `persistent` yok sayılır. */
export const tokenStore = {
  get: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  set: (key: string, value: string, _persistent: boolean): Promise<void> => AsyncStorage.setItem(key, value),
  remove: (key: string): Promise<void> => AsyncStorage.removeItem(key),
  isPersistent: async (_key: string): Promise<boolean> => true
};

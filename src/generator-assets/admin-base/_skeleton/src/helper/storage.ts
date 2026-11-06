import type { ThemeMode } from '@/store/slices/themeSlice';
import { APP_CONFIG } from '@/config/app';

/**
 * Token: "Beni hatırla" işaretliyse `localStorage` (tarayıcı kapanıp açılınca otomatik giriş), değilse
 * `sessionStorage` (sayfa yenilenince kalır, tarayıcı kapanınca biter). Diğerindeki eski kopya silinir.
 */
export const saveTokenToStorage = (token: string, key: string, remember = true): void => {
  try {
    (remember ? localStorage : sessionStorage).setItem(key, token);
    (remember ? sessionStorage : localStorage).removeItem(key);
  } catch (error) {
    console.error('Token kaydedilemedi:', error);
  }
};

export const getTokenFromStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch (error) {
    console.error('Token okunamadı:', error);
    return null;
  }
};

export const removeTokenFromStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error('Token silinemedi:', error);
  }
};

export const readThemeMode = (): ThemeMode | null => {
  try {
    const mode = localStorage.getItem(APP_CONFIG.storage.themeMode);
    return mode === 'light' || mode === 'dark' ? mode : null;
  } catch {
    return null;
  }
};

export const saveThemeMode = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(APP_CONFIG.storage.themeMode, mode);
  } catch {
    // Gizli pencere vb.: tema yalnız bu oturumda kalır.
  }
};

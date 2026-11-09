import { showError, showSuccess } from '@/components/Core/Toast';
import type { ErrorData } from '@/types';

export const BASE_URL: string | undefined = import.meta.env.VITE_API_BASE_URL || undefined;

export const showSuccessMessage = (message: string) => showSuccess(message);

export const showErrorMessage = (errorData: ErrorData) => showError(errorData.message);

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tokenStore = {
  get: async (key: string): Promise<string | null> => safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null),
  set: async (key: string, value: string, persistent: boolean): Promise<void> =>
    safe(() => {
      (persistent ? localStorage : sessionStorage).setItem(key, value);
      (persistent ? sessionStorage : localStorage).removeItem(key);
    }, undefined),
  remove: async (key: string): Promise<void> =>
    safe(() => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }, undefined),
  isPersistent: async (key: string): Promise<boolean> => safe(() => localStorage.getItem(key) !== null, false)
};

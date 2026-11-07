// Tarayıcı (admin + web) platform adaptörü (docs/frontend/http-layer.md). Admin ve web'de birebir aynıdır; projede
// değiştirilmez. Ortak `api.ts` yalnız bunları platformdan alır.
import { showError, showSuccess } from '@/components';
import type { ErrorData } from '@/types';

/** Yalnız origin; yollar `/api/...`. */
export const BASE_URL: string | undefined = import.meta.env.VITE_API_BASE_URL || undefined;

export const showSuccessMessage = (message: string) => showSuccess(message);

export const showErrorMessage = (errorData: ErrorData) => showError(errorData.message);

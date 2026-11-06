import { configureStore } from '@reduxjs/toolkit';
import themeSlice from './slices/themeSlice';
import authSlice from './slices/authSlice';
import commonSlice from './slices/commonSlice';

// Kaynak sayfalarının durumu @atakanimo/ata-admin-base'de (TanStack Query); store yalnızca tema, auth, loading.
// Elle yazılan sayfaların slice'ları buraya eklenir.
export const store = configureStore({
  reducer: {
    theme: themeSlice,
    auth: authSlice,
    common: commonSlice
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { GetCommonState } from './slices/commonSlice';
export { GetAuthState } from './slices/authSlice';
export { GetThemeState } from './slices/themeSlice';

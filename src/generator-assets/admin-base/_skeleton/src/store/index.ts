// Redux store: tema, auth, loading; kaynak sayfalarının durumu @atakanimo/ata-admin-base'de (TanStack Query).
import { configureStore } from '@reduxjs/toolkit';
import themeSlice from './slices/theme.slice';
import { authReducer } from './slices/auth.slice.generated';
import commonSlice from './slices/common.slice';

export const store = configureStore({
  reducer: {
    theme: themeSlice,
    auth: authReducer,
    common: commonSlice
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { GetCommonState } from './slices/common.slice';
export { GetAuthState } from './slices/auth.slice.generated';
export { GetThemeState } from './slices/theme.slice';

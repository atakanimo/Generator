import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { readThemeMode, saveThemeMode } from '@/helper';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  drawerOpen: boolean;
}

/** Menü başlangıçta yalnızca kalıcı (geniş ekran, MUI `lg` ≥ 1200px) olduğu yerde açık; dar ekranda içeriği örten geçici çekmecedir. */
const WIDE_SCREEN = typeof window !== 'undefined' && window.matchMedia('(min-width: 1200px)').matches;

const initialState: ThemeState = {
  mode: readThemeMode() ?? 'light',
  drawerOpen: WIDE_SCREEN
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme: state => {
      state.mode = state.mode === 'light' ? 'dark' : 'light';
      saveThemeMode(state.mode);
    },
    toggleDrawer: state => {
      state.drawerOpen = !state.drawerOpen;
    },
    setDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.drawerOpen = action.payload;
    }
  }
});

export const GetThemeState = (state: RootState) => state.theme;
export const { toggleTheme, toggleDrawer, setDrawerOpen } = themeSlice.actions;
export default themeSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  initialized: boolean;
  version: string;
}

const initialState: AppState = {
  initialized: true,
  version: '1.0.0',
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.initialized = action.payload;
    },
  },
});

export const { setInitialized } = appSlice.actions;
export default appSlice.reducer;


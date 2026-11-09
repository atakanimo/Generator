// Global loading durumu.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store';

interface CommonState {
  isLoading: boolean;
}

const initialState: CommonState = {
  isLoading: false
};

/** Global loading: `services/api/api.generated.ts` açar / kapatır (`skipLoading` istekleri hariç). */
const commonSlice = createSlice({
  name: 'common',
  initialState,
  reducers: {
    setCommonLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    }
  }
});

export const GetCommonState = (state: RootState) => state.common;
export const { setCommonLoading } = commonSlice.actions;
export default commonSlice.reducer;

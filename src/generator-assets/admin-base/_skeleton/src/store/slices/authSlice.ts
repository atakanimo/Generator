import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '..';
import type { AuthResult, AuthUser, LoginRequest } from '@/types';
import { authServices } from '@/services/auth.services';
import { getTokenFromStorage, removeTokenFromStorage, saveTokenToStorage } from '@/helper';
import { APP_CONFIG } from '@/config/app';

/** Thunk sonucu her zaman fulfilled: sayfa `const { isSuccess } = await dispatch(login(…)).unwrap()` ile dallanır. */
type AuthThunkResult<T> = { isSuccess: boolean; data: T | null; error: string | null };

/** Panel yalnızca admin rolü içindir; admin olmayan kullanıcı girişte reddedilir (`error` bir i18n anahtarıdır). */
const ADMIN_ONLY = 'auth.adminOnly';

/** `rememberMe` yalnız istemcide (token nerede saklanır); BE'ye gitmez. */
export const login = createAsyncThunk('auth/login', async ({ email, password }: LoginRequest & { rememberMe?: boolean }): Promise<AuthThunkResult<AuthResult>> => {
  try {
    const { data } = await authServices.login({ email, password });
    if (data.user.role !== 'admin') return { isSuccess: false, data: null, error: ADMIN_ONLY };
    return { isSuccess: true, data, error: null };
  } catch {
    // Hata mesajını interceptor toast olarak gösterdi.
    return { isSuccess: false, data: null, error: null };
  }
});

export const me = createAsyncThunk('auth/me', async (): Promise<AuthThunkResult<AuthUser>> => {
  try {
    const { data } = await authServices.me();
    return data.role === 'admin' ? { isSuccess: true, data, error: null } : { isSuccess: false, data: null, error: ADMIN_ONLY };
  } catch {
    return { isSuccess: false, data: null, error: null };
  }
});

interface AuthState {
  user: AuthUser | null;
  token: string;
  isAuthenticated: boolean;
  /** Kayıtlı token `me` ile doğrulanana kadar true. */
  checking: boolean;
  error: string | null;
}

const savedToken = getTokenFromStorage(APP_CONFIG.storage.token) ?? '';

const initialState: AuthState = {
  user: null,
  token: savedToken,
  isAuthenticated: false,
  checking: !!savedToken,
  error: null
};

const signedOut = (state: AuthState) => {
  state.user = null;
  state.token = '';
  state.isAuthenticated = false;
  state.checking = false;
  state.error = null;
  removeTokenFromStorage(APP_CONFIG.storage.token);
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: signedOut
  },
  extraReducers: builder => {
    builder
      .addCase(login.fulfilled, (state, action) => {
        const { isSuccess, data, error } = action.payload;
        state.error = error || null;
        if (!isSuccess || !data) return;
        state.user = data.user;
        state.token = data.token;
        state.isAuthenticated = true;
        saveTokenToStorage(data.token, APP_CONFIG.storage.token, action.meta.arg.rememberMe === true);
      })
      .addCase(me.fulfilled, (state, action) => {
        const { isSuccess, data } = action.payload;
        if (!isSuccess || !data) return signedOut(state);
        state.user = data;
        state.isAuthenticated = true;
        state.checking = false;
      });
  }
});

export const GetAuthState = (state: RootState) => state.auth;

export const { logout } = authSlice.actions;
export default authSlice.reducer;

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '..';
import type { AuthSession, AuthUser, LoginRequest } from '@/types';
import { authServices } from '@/services/auth.services';
import { getTokenFromStorage, removeTokenFromStorage, saveTokenToStorage } from '@/helper';
import { APP_CONFIG } from '@/config/app';

/** Thunk sonucu her zaman fulfilled: sayfa `const { isSuccess } = await dispatch(login(…)).unwrap()` ile dallanır. */
type AuthThunkResult<T> = { isSuccess: boolean; data: T | null; error: string | null };

/** Panel yalnızca admin rolü içindir; admin olmayan kullanıcı girişte reddedilir (`error` bir i18n anahtarıdır). */
const ADMIN_ONLY = 'auth.adminOnly';

/** `rememberMe` yalnız istemcide (token'lar nerede saklanır); BE'ye gitmez. */
export const login = createAsyncThunk('auth/login', async ({ email, password }: LoginRequest & { rememberMe?: boolean }): Promise<AuthThunkResult<AuthSession>> => {
  try {
    const { data } = await authServices.login({ email, password });
    if (data.user.role !== 'admin') {
      // Admin olmayan oturum hemen kapatılır (refresh token BE'de iptal).
      authServices.logout(data.refreshToken).catch(() => undefined);
      return { isSuccess: false, data: null, error: ADMIN_ONLY };
    }
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

/** Çıkış: BE o oturumun refresh token'ını iptal eder; cevap ne olursa olsun yerel oturum kapanır. */
export const logout = createAsyncThunk('auth/logout', async (_: void, { getState }): Promise<AuthThunkResult<null>> => {
  const { refreshToken } = (getState() as RootState).auth;
  try {
    if (refreshToken) await authServices.logout(refreshToken);
  } catch {
    // Ağ hatası: yerel çıkış yine yapılır.
  }
  return { isSuccess: true, data: null, error: null };
});

interface AuthState {
  user: AuthUser | null;
  /** Access token (kısa ömürlü; 401'de `services/api.ts` refresh token ile yeniler). */
  token: string;
  refreshToken: string;
  isAuthenticated: boolean;
  /** Kayıtlı token `me` ile doğrulanana kadar true. */
  checking: boolean;
  error: string | null;
}

const savedToken = getTokenFromStorage(APP_CONFIG.storage.token) ?? '';

const initialState: AuthState = {
  user: null,
  token: savedToken,
  refreshToken: getTokenFromStorage(APP_CONFIG.storage.refreshToken) ?? '',
  isAuthenticated: false,
  // Yalnız refresh token kalmışsa da `me` denenir (interceptor 401'de yeniler).
  checking: !!(savedToken || getTokenFromStorage(APP_CONFIG.storage.refreshToken)),
  error: null
};

/** Token'lar girişteki "Beni hatırla" seçimiyle aynı yere yazılır. */
const storeSession = (state: AuthState, session: AuthSession, remember: boolean) => {
  state.user = session.user;
  state.token = session.accessToken;
  state.refreshToken = session.refreshToken;
  state.isAuthenticated = true;
  saveTokenToStorage(session.accessToken, APP_CONFIG.storage.token, remember);
  saveTokenToStorage(session.refreshToken, APP_CONFIG.storage.refreshToken, remember);
};

const rememberedInLocalStorage = () => {
  try {
    return localStorage.getItem(APP_CONFIG.storage.refreshToken) !== null;
  } catch {
    return false;
  }
};

const signedOut = (state: AuthState) => {
  state.user = null;
  state.token = '';
  state.refreshToken = '';
  state.isAuthenticated = false;
  state.checking = false;
  state.error = null;
  removeTokenFromStorage(APP_CONFIG.storage.token);
  removeTokenFromStorage(APP_CONFIG.storage.refreshToken);
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Refresh başarısız (ya da oturum BE'de bitti): yalnız yerel çıkış. */
    clearSession: signedOut,
    /** `services/api.ts` refresh'i: yeni token çifti (rotation). */
    sessionRefreshed: (state, action: PayloadAction<AuthSession>) => storeSession(state, action.payload, rememberedInLocalStorage()),
    /** Başka sekme yeniledi: storage'daki token'lar alınır (yeniden yazılmaz). */
    tokenAdopted: (state, action: PayloadAction<{ token: string; refreshToken: string }>) => {
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
    }
  },
  extraReducers: builder => {
    builder
      .addCase(login.fulfilled, (state, action) => {
        const { isSuccess, data, error } = action.payload;
        state.error = error || null;
        if (!isSuccess || !data) return;
        storeSession(state, data, action.meta.arg.rememberMe === true);
      })
      .addCase(me.fulfilled, (state, action) => {
        const { isSuccess, data } = action.payload;
        if (!isSuccess || !data) return signedOut(state);
        state.user = data;
        state.isAuthenticated = true;
        state.checking = false;
      })
      .addCase(logout.fulfilled, signedOut);
  }
});

export const GetAuthState = (state: RootState) => state.auth;

export const { clearSession, sessionRefreshed, tokenAdopted } = authSlice.actions;
export default authSlice.reducer;

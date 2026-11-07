import { API } from './api';
import type { AuthSession, AuthUser, LocalResponse, LoginRequest } from '@/types';
import { APP_CONFIG } from '@/config/app';

export const authServices = {
  login: (data: LoginRequest): Promise<LocalResponse<AuthSession>> => API({ url: APP_CONFIG.auth.login, method: 'POST', data, skipSuccessToast: true }),
  me: (): Promise<LocalResponse<AuthUser>> => API({ url: APP_CONFIG.auth.me, method: 'GET', skipLoading: true }),
  /** O oturumun refresh token'ını iptal eder; cevabı beklemeye gerek yok (çıkış yerelde de yapılır). */
  logout: (refreshToken: string): Promise<LocalResponse<null>> =>
    API({ url: APP_CONFIG.auth.logout, method: 'POST', data: { refreshToken }, skipLoading: true, skipSuccessToast: true })
};

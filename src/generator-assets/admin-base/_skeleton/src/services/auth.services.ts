import { API } from './api';
import type { AuthResult, AuthUser, LocalResponse, LoginRequest } from '@/types';
import { APP_CONFIG } from '@/config/app';

export const authServices = {
  login: (data: LoginRequest): Promise<LocalResponse<AuthResult>> => API({ url: APP_CONFIG.auth.login, method: 'POST', data, skipSuccessToast: true }),
  me: (): Promise<LocalResponse<AuthUser>> => API({ url: APP_CONFIG.auth.me, method: 'GET', skipLoading: true })
};

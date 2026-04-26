import { request } from '../client';

// 백엔드 실응답 shape (smoke test 캡처: docs/_swagger_responses.md §1)

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface AuthSession {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  sessionId: string;
  expiresIn?: string;
}

export interface SignupBody {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  termsAgreed: true;
}

export interface LoginBody {
  email: string;
  password: string;
}

export const auth = {
  signup: (body: SignupBody) =>
    request<AuthSession>('/auth/signup', { method: 'POST', body, skipAuth: true }),

  login: (body: LoginBody) =>
    request<AuthSession>('/auth/login', { method: 'POST', body, skipAuth: true }),

  // logout: refresh 토큰을 본문에 같이 보내야 세션 무효화됨
  logout: (refreshToken: string) =>
    request<{ revoked: boolean; sessionId: string; message: string }>(
      '/auth/logout',
      { method: 'POST', body: { refreshToken } },
    ),

  refresh: (refreshToken: string) =>
    request<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      skipAuth: true,
    }),

  me: () => request<ApiUser>('/api/me'),
};

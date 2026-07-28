import { request } from '../client';

// 백엔드 실응답 shape (smoke test 캡처: docs/_swagger_responses.md §1)

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string; // 본 서비스는 단일 Actor — 분기에 사용하지 않음
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

// backend-backlog §15 — release 2026-07-26: 프로필 수정.
// 이메일은 인증 식별자라 변경 불가(백엔드가 name 만 받는다).
export interface UpdateMeBody {
  name?: string;
}
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
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

  // backend-backlog §15 — 이름 변경. 응답은 { user } 래핑(me() 의 flat ApiUser 와 다름).
  updateMe: (body: UpdateMeBody) =>
    request<{ user: ApiUser }>('/api/me', { method: 'PATCH', body }),

  // backend-backlog §15 — 비밀번호 변경. 에러: current_password_invalid /
  // password_confirm_mismatch / password_policy_violation.
  changePassword: (body: ChangePasswordBody) =>
    request<{ updated: boolean }>('/api/me/password', { method: 'PATCH', body }),
};

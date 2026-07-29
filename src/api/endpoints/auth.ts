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

// backend-backlog §30 — 회원 탈퇴. **아직 백엔드에 없다** (2026-07-29 운영 OpenAPI 실측:
// /api/me 는 get·patch 뿐). 스토어 계층에서 404/405 를 '미구현'으로 구분해 처리하므로
// 여기서는 계약만 선반영한다.
// password 를 싣는 건 서버가 재인증을 요구할 가능성이 높아서다 — 서버가 무시해도 무해.
export interface DeleteMeBody {
  password: string;
}
export interface DeleteMeResponse {
  deleted?: boolean;
  message?: string;
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

  // backend-backlog §30 — 앱 내 회원 탈퇴 (Apple 심사 요건). 백엔드 미구현 상태에선 404.
  deleteMe: (body: DeleteMeBody) =>
    request<DeleteMeResponse>('/api/me', { method: 'DELETE', body }),
};

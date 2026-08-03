import { request } from '../client';

// 백엔드 실응답 shape (smoke test 캡처: docs/_swagger_responses.md §1)

// backend-backlog §30-C — 약관 동의 버전 이력 (append-only `legal_consents`).
// `agreed` 는 문서별 **최신** 동의 버전(미동의면 null), `current` 는 서버가 현행으로 보는 버전,
// `needsReaccept` 는 둘의 불일치.
//
// ⚠️ 지금은 `needsReaccept` 가 **모든 사용자에게 true** 다. 서버 현행은 `2026-08-03` 인데
// 프론트는 `utils/contact.ts` 규칙에 따라 **실제 서빙 중인 본문의 시행일**(`2026-06-18`)만
// 보내기 때문이다 — 그 규칙이 옳고(사용자는 배포되지 않은 문서에 동의할 수 없다), 불일치의
// 원인은 §30-B(약관 본문 미교체)다. 그래서 재동의 배너는 **아직 붙이지 않는다**:
// 지금 붙이면 전원에게 뜨고, 눌러도 사용자가 읽을 새 본문이 없다.
export interface LegalConsentState {
  agreed: Partial<Record<'service' | 'privacy' | 'location', string | null>>;
  current: Partial<Record<'service' | 'privacy' | 'location', string>>;
  needsReaccept: boolean;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string; // 본 서비스는 단일 Actor — 분기에 사용하지 않음
  createdAt: string;
  // §30-C — GET /api/me 만 실어준다 (login/signup 세션 응답의 user 에는 없다).
  legal?: LegalConsentState;
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
  // backend-backlog §30-D — 어느 문서의 어느 버전에 동의했는지. 값은 **시행일**(YYYY-MM-DD).
  // 백엔드 미구현 상태에선 무시된다(signup 이 필드를 골라 읽는 구조라 안전 — 실측 확인).
  // 배포된 문서만 실린다 — utils/contact.ts `agreedTermsPayload` 참조.
  agreedTerms?: Partial<Record<'service' | 'privacy' | 'location', string>>;
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

// backend-backlog §30-A — 회원 탈퇴 (Play 심사 요건).
// **배포 완료** (2026-08-03 운영 OpenAPI 재확인: `/api/me` 는 get·patch·**delete**).
// 선반영해 둔 계약이 그대로 맞았다 — password 재인증, 성공 200 `{ deleted: true }`,
// 불일치 400 `current_password_invalid`, 이미 삭제 404 `user_not_found`.
// 삭제 범위는 외근·방문·보고서·메모·카테고리·현장·스토리지 + 전 세션 무효(진행 중 외근 포함),
// soft delete + 이메일 익명화라 **동일 이메일 재가입이 허용**된다.
// (스토어의 404/405 '미구현' 분기는 구 서버를 향한 앱이 남아 있을 수 있어 남겨둔다.)
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

  // backend-backlog §30-A — 앱 내 회원 탈퇴 (Play 심사 요건). 2026-07-29 배포됨.
  deleteMe: (body: DeleteMeBody) =>
    request<DeleteMeResponse>('/api/me', { method: 'DELETE', body }),

  // backend-backlog §30-C — 재동의 기록. 이력은 append 라 같은 버전을 다시 보내도 행이 쌓인다
  // (덮어쓰기가 아니다) — 화면에서 **중복 호출을 막는 건 프론트 책임**이다.
  // 호출부는 §30-B(새 약관 본문 배포) 이후에 붙인다. 그 전까지 배선하면 사용자가 읽을 수 없는
  // 문서에 동의시키게 된다 — LegalConsentState 주석의 이유와 같다.
  acceptLegalTerms: (body: {
    agreedTerms: Partial<Record<'service' | 'privacy' | 'location', string>>;
  }) =>
    request<{ legal: LegalConsentState }>('/api/me/legal/accept', {
      method: 'POST',
      body,
    }),
};

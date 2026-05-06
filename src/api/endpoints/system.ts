import { request } from '../client';

export interface SessionPolicy {
  client: {
    idleLockMinutes: number;
    backgroundReauthAfterMinutes: number;
    secureStorage: { ios: string; android: string };
    rootDetectionRecommended: boolean;
    automaticLogin: { description: string };
  };
  server: {
    accessTokenExpiresIn: string; // "1h"
    refreshTokenExpiresIn: string; // "14d"
    sessionIdleMinutes: number;
    sessionIdleNote: string;
    refreshRotation: boolean;
    refreshReuseRevokesAllSessions: boolean;
    refreshSupersedeWindowMs: number;
  };
}

// /api/system/session/activity 응답 (handoff §2 확정 contract).
// 200 으로 { ok: true, lastActivityAt } 반환. 토큰 검증 실패 시 401, 미인증 호출 시
// 400 session_id_missing.
export interface SessionActivityResponse {
  ok: boolean;
  lastActivityAt: string; // ISO8601
}

export const system = {
  health: () => request<{ status: string }>('/health', { skipAuth: true }),
  sessionPolicy: () =>
    request<SessionPolicy>('/api/system/session/policy', { skipAuth: true }),
  sessionActivity: () =>
    request<SessionActivityResponse>('/api/system/session/activity', {
      method: 'POST',
    }),
};

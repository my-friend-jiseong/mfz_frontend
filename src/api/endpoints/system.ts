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

// /api/system/session/activity 응답 — 보통 204 No Content (빈 본문).
// 백엔드가 이행 정보를 줄 수도 있어 옵셔널 필드로 받음.
export interface SessionActivityResponse {
  ok?: boolean;
  refreshedUntil?: string; // ISO8601 — 이번 ping 으로 idle timer 가 연장된 시각
}

export const system = {
  health: () => request<{ status: string }>('/health', { skipAuth: true }),
  sessionPolicy: () =>
    request<SessionPolicy>('/api/system/session/policy', { skipAuth: true }),
  sessionActivity: () =>
    request<SessionActivityResponse | null>('/api/system/session/activity', {
      method: 'POST',
    }),
};

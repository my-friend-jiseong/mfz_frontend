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

export const system = {
  health: () => request<{ status: string }>('/health', { skipAuth: true }),
  sessionPolicy: () =>
    request<SessionPolicy>('/api/system/session/policy', { skipAuth: true }),
  sessionActivity: () =>
    request<unknown>('/api/system/session/activity', { method: 'POST' }),
};

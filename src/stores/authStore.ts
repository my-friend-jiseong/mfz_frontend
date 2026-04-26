import { create } from 'zustand';
import type { User } from '@/types/entities';
import { auth, configureAuth, ApiError, NetworkError } from '@/api';
import {
  saveRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
} from '@/api/storage';

type Result<T = void> = { ok: true; value?: T } | { ok: false; error: string };

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean; // 부팅 시 자동 세션 복원 중

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<Result>;
  signup: (
    email: string,
    password: string,
    passwordConfirm: string,
    name: string,
  ) => Promise<Result>;
  logout: () => Promise<void>;

  // 내부 — client.ts 가 401 처리 시 호출
  _refreshAccess: () => Promise<string | null>;
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message || `오류 (HTTP ${e.status})`;
  if (e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류';
}

// 백엔드 응답이 비어 있거나 필수 필드 누락 시 안전 가드.
// 정상 응답: { user, accessToken, refreshToken, ... } (smoke test 캡처)
function isValidSession(s: unknown): s is { user: User; accessToken: string; refreshToken: string } {
  return (
    !!s &&
    typeof s === 'object' &&
    typeof (s as { accessToken?: unknown }).accessToken === 'string' &&
    typeof (s as { refreshToken?: unknown }).refreshToken === 'string' &&
    !!(s as { user?: unknown }).user
  );
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    set({ isHydrating: true });
    try {
      const refresh = await loadRefreshToken();
      if (!refresh) {
        set({ isHydrating: false });
        return;
      }
      const session = await auth.refresh(refresh);
      if (!isValidSession(session)) throw new Error('세션 응답이 비어있습니다');
      await saveRefreshToken(session.refreshToken);
      set({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isAuthenticated: true,
        isHydrating: false,
      });
    } catch {
      // refresh 무효 → 저장된 토큰 폐기 후 비로그인 상태로 진입
      await clearRefreshToken();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isHydrating: false,
      });
    }
  },

  login: async (email, password) => {
    try {
      const session = await auth.login({ email, password });
      if (!isValidSession(session)) {
        if (__DEV__) console.warn('[authStore] login 응답 shape 비정상:', session);
        return { ok: false, error: '서버 응답이 올바르지 않습니다' };
      }
      await saveRefreshToken(session.refreshToken);
      set({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isAuthenticated: true,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  signup: async (email, password, passwordConfirm, name) => {
    try {
      const session = await auth.signup({
        email,
        password,
        passwordConfirm,
        name,
        termsAgreed: true,
      });
      if (!isValidSession(session)) {
        if (__DEV__) console.warn('[authStore] signup 응답 shape 비정상:', session);
        return { ok: false, error: '서버 응답이 올바르지 않습니다' };
      }
      await saveRefreshToken(session.refreshToken);
      set({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isAuthenticated: true,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  logout: async () => {
    const rt = get().refreshToken;
    if (rt) {
      // 서버 알림은 best-effort — 실패해도 로컬은 비운다
      try {
        await auth.logout(rt);
      } catch {
        /* ignore */
      }
    }
    await clearRefreshToken();
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  _refreshAccess: async () => {
    const rt = get().refreshToken;
    if (!rt) return null;
    try {
      const session = await auth.refresh(rt);
      if (!isValidSession(session)) throw new Error('refresh 응답이 비어있습니다');
      await saveRefreshToken(session.refreshToken);
      set({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isAuthenticated: true,
      });
      return session.accessToken;
    } catch {
      // refresh 자체가 실패하면 강제 로그아웃
      await clearRefreshToken();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
      return null;
    }
  },
}));

// API 클라이언트에 토큰 핸들러 주입 (모듈 로드 시 1회)
configureAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => useAuthStore.getState()._refreshAccess(),
});

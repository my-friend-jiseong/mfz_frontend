import { create } from 'zustand';
import type { User } from '@/types/entities';
import { auth, configureAuth, localizeError, errorCode, ApiError } from '@/api';
import {
  saveRefreshToken,
  loadRefreshToken,
  clearRefreshToken,
} from '@/api/storage';
import { useSessionGuardStore } from './sessionGuardStore';
import { useOfflineQueueStore } from './offlineQueueStore';
import { useDestinationStore } from './destinationStore';

type Result<T = void> =
  | { ok: true; value?: T }
  | { ok: false; error: string; code?: string };

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

// 영문 식별자 → 한국어 매핑은 src/api/errors.ts 의 localizeError 가 담당
const describeError = localizeError;

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
    // 중복 호출 가드 — 동시 hydrate 가 refresh 토큰을 두 번 회전시키면
    // 두 번째가 refresh_token_superseded 로 실패함.
    if (hydrateInflight) return hydrateInflight;
    hydrateInflight = (async () => {
      set({ isHydrating: true });
      let refresh: string | null = null;
      try {
        refresh = await loadRefreshToken();
        if (!refresh) {
          set({ isHydrating: false });
          return;
        }
        const session = await auth.refresh(refresh);
        if (!isValidSession(session)) {
          // 응답 shape 이상은 서버 일시 문제로 간주 — 토큰 보존, 비로그인 상태로 진입.
          if (__DEV__) console.warn('[auth.hydrate] 세션 응답 shape 이상, 토큰 보존', session);
          set({ isHydrating: false });
          return;
        }
        await saveRefreshToken(session.refreshToken);
        set({
          user: session.user,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          isAuthenticated: true,
          isHydrating: false,
        });
      } catch (e) {
        // 정책: 토큰 폐기는 "서버가 명시적으로 거부한 경우" 에만.
        // - all_sessions_revoked / refresh_token_superseded: 보안 코드 → 폐기 + 안내
        // - 401 (그 외 코드): 토큰 무효 → 폐기
        // - refresh_token_superseded: 다른 탭이 회전했을 가능성 → 저장소 최신값으로 1회 재시도
        // - 네트워크 에러 / 5xx / 그 외: 일시적 장애 → 토큰 보존, 사용자 재시도 가능
        const isApi = e instanceof ApiError;
        const code = isApi ? (e as ApiError).code : null;
        const status = isApi ? (e as ApiError).status : null;

        // multi-tab race 복구 — _refreshAccess 와 동일한 패턴
        if (isApi && code === 'refresh_token_superseded') {
          const stored = await loadRefreshToken();
          if (stored && stored !== refresh) {
            try {
              const session = await auth.refresh(stored);
              if (isValidSession(session)) {
                await saveRefreshToken(session.refreshToken);
                set({
                  user: session.user,
                  accessToken: session.accessToken,
                  refreshToken: session.refreshToken,
                  isAuthenticated: true,
                  isHydrating: false,
                });
                if (__DEV__) console.log('[auth.hydrate] superseded → recovered with stored refresh');
                return;
              }
            } catch {
              /* fallthrough — 안내 후 폐기 */
            }
          }
          useSessionGuardStore.getState().show('superseded', (e as ApiError).message);
          await clearRefreshToken();
          set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isHydrating: false });
          return;
        }

        if (isApi && code === 'all_sessions_revoked') {
          useSessionGuardStore.getState().show('revoked', (e as ApiError).message);
          await clearRefreshToken();
          set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isHydrating: false });
          return;
        }

        // 그 외 401: 토큰 진짜 무효 → 폐기
        if (isApi && status === 401) {
          if (__DEV__) console.warn('[auth.hydrate] refresh 401, 토큰 폐기', code);
          await clearRefreshToken();
          set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isHydrating: false });
          return;
        }

        // 네트워크 / 5xx / 기타 일시적 장애: 토큰 보존, 비로그인 상태로 진입 (사용자가 재시도 가능)
        if (__DEV__) console.warn('[auth.hydrate] 일시적 장애, 토큰 보존', e instanceof Error ? e.message : e);
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isHydrating: false });
      } finally {
        hydrateInflight = null;
      }
    })();
    return hydrateInflight;
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
      return { ok: false, error: describeError(e), code: errorCode(e) ?? undefined };
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
      return { ok: false, error: describeError(e), code: errorCode(e) ?? undefined };
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
    await useOfflineQueueStore.getState().clear();
    useDestinationStore.getState().clearAll();
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  _refreshAccess: async () => {
    return refreshAccessSingleFlight();
  },
}));

// hydrate single-flight — 루트 레이아웃과 다른 진입점에서 동시에 hydrate 가
// 호출돼도 refresh 회전이 한 번만 일어나도록.
let hydrateInflight: Promise<void> | null = null;

// Single-flight refresh — 동시 401 다중 발생 시 refresh 가 여러 번 호출되어
// 백엔드의 "refresh rotation/재사용 감지" 정책에 걸려 전체 세션이 강제 로그아웃되는
// 회귀 방지. 첫 호출이 진행 중이면 같은 promise 를 공유.
let refreshInflight: Promise<string | null> | null = null;
async function refreshAccessSingleFlight(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    const store = useAuthStore.getState();
    const rt = store.refreshToken;
    if (__DEV__) console.log('[auth] _refreshAccess start, hasRefresh=', !!rt);
    if (!rt) return null;
    try {
      const session = await auth.refresh(rt);
      if (!isValidSession(session)) throw new Error('refresh 응답이 비어있습니다');
      await saveRefreshToken(session.refreshToken);
      useAuthStore.setState({
        user: session.user,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        isAuthenticated: true,
      });
      if (__DEV__) console.log('[auth] _refreshAccess SUCCESS');
      return session.accessToken;
    } catch (e) {
      // Phase 7 — refresh_token_superseded: 다른 곳에서 이미 새로 refresh 된 상태.
      // 로컬 storage 의 refresh 가 우리가 시도한 것과 다르면(다른 앱 인스턴스가 갱신함),
      // 그 토큰으로 한 번만 더 시도. 그래도 실패하면 강제 로그아웃 + 안내.
      if (e instanceof ApiError && e.code === 'refresh_token_superseded') {
        const stored = await loadRefreshToken();
        if (stored && stored !== rt) {
          try {
            const session = await auth.refresh(stored);
            if (isValidSession(session)) {
              await saveRefreshToken(session.refreshToken);
              useAuthStore.setState({
                user: session.user,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                isAuthenticated: true,
              });
              if (__DEV__) console.log('[auth] superseded → recovered with stored refresh');
              return session.accessToken;
            }
          } catch {
            /* fallthrough — 안내 후 강제 로그아웃 */
          }
        }
        useSessionGuardStore.getState().show('superseded', e.message);
        await clearRefreshToken();
        useAuthStore.setState({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        return null;
      }
      // Phase 7 — all_sessions_revoked: 보안상 전체 세션 종료. 강제 로그아웃 + 보안 경고 모달.
      if (e instanceof ApiError && e.code === 'all_sessions_revoked') {
        useSessionGuardStore.getState().show('revoked', e.message);
        await clearRefreshToken();
        useAuthStore.setState({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        return null;
      }
      if (__DEV__) console.error('[auth] _refreshAccess FAILED — store cleared', e);
      await clearRefreshToken();
      useAuthStore.setState({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
      return null;
    } finally {
      // 다음 사이클에서 새 호출은 새 refresh 를 시도할 수 있도록 클리어
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

// API 클라이언트에 토큰 핸들러 주입 (모듈 로드 시 1회)
configureAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => useAuthStore.getState()._refreshAccess(),
});

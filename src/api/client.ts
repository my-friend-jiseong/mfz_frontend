import { API_BASE_URL, DEFAULT_TIMEOUT_MS } from './config';
import { ApiError, NetworkError } from './errors';

// 토큰 핸들러는 외부(authStore)에서 주입받는다.
// 401 응답 시 onUnauthorized 가 호출되어 refresh 시도 → 새 access 반환 → 재요청.
// refresh 도 실패하면 onUnauthorized 가 null 을 반환하면 클라이언트는 401을 그대로 throw.
interface AuthHandlers {
  getAccessToken: () => string | null;
  onUnauthorized: () => Promise<string | null>;
}

let handlers: AuthHandlers = {
  getAccessToken: () => null,
  onUnauthorized: async () => null,
};

export function configureAuth(h: AuthHandlers) {
  handlers = h;
}

interface RequestInit_ {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown; // JSON.stringify 됨. FormData 는 그대로 통과.
  query?: Record<string, string | number | boolean | undefined | null> | object;
  // signup/login 등 토큰 부착하지 않는 호출용. 기본은 자동 부착.
  skipAuth?: boolean;
  // FormData 업로드 시 true (Content-Type 자동 설정 위임)
  multipart?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestInit_['query']): string {
  const base = API_BASE_URL + (path.startsWith('/') ? path : `/${path}`);
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// __DEV__ 로그용 — login/refresh 응답의 token 필드를 평문으로 콘솔에 노출하지 않게 마스킹.
// 화면 공유·screencast 시 누출 위험 차단. Sentry 의 beforeSend 와 같은 정책.
//
// 키 이름 전체 매칭 (substring 아님) — `authorId`/`refreshedAt`/`authoredBy` 같은
// 무해한 키가 [REDACTED] 로 덮여 디버깅이 불가능해지던 회로 차단.
const SECRET_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'token',
  'secret',
  'authorization',
]);
function isSecretKey(k: string): boolean {
  return SECRET_KEYS.has(k.toLowerCase());
}
function maskSecretsForLog(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(maskSecretsForLog);
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(k)) masked[k] = '[REDACTED]';
    else if (v && typeof v === 'object') masked[k] = maskSecretsForLog(v);
    else masked[k] = v;
  }
  return masked;
}

async function rawRequest<T>(path: string, init: RequestInit_, accessToken: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (!init.multipart) headers['Content-Type'] = 'application/json';
  if (!init.skipAuth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, DEFAULT_TIMEOUT_MS);
  init.signal?.addEventListener('abort', () => ac.abort());

  let res: Response;
  try {
    res = await fetch(buildUrl(path, init.query), {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined
        ? undefined
        : init.multipart
          ? (init.body as BodyInit)
          : JSON.stringify(init.body),
      signal: ac.signal,
    });
  } catch (e) {
    // timeout 으로 abort 된 케이스 분리 — 사용자 친화 메시지.
    // (caller 가 직접 abort 한 경우는 timedOut=false 라 network kind 로 흐름)
    throw new NetworkError(e, timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  // 본문이 없을 수 있는 응답(204 등) 안전 파싱
  const text = await res.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // text 그대로 둠
    }
  } else {
    body = null;
  }

  if (__DEV__) {
    const authTag = init.skipAuth ? '[skip-auth]' : accessToken ? '[auth]' : '[NO_AUTH]';
    console.log(
      `[api] ${init.method ?? 'GET'} ${path} → ${res.status} ${authTag} ${text.length === 0 ? '(empty body)' : ''}`,
      text.length > 0 && text.length < 2000 ? maskSecretsForLog(body) : `(${text.length} bytes)`,
    );
  }

  if (!res.ok) {
    // Phase 7 통일 shape: { code, message, fields?, details? }
    const errBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const code = typeof errBody.code === 'string' ? errBody.code : 'internal_server_error';
    const message = typeof errBody.message === 'string' && errBody.message.trim()
      ? errBody.message
      : `HTTP ${res.status}`;
    const fields = errBody.fields && typeof errBody.fields === 'object'
      ? (errBody.fields as Record<string, string>)
      : undefined;
    const details = errBody.details && typeof errBody.details === 'object'
      ? (errBody.details as Record<string, unknown>)
      : undefined;
    const err = new ApiError({ status: res.status, message, code, fields, details, body });
    // 5xx 는 Sentry 캡처 (있을 때만, code 로 fingerprint). 4xx 는 정상 분기라 패스.
    if (res.status >= 500) {
      // 동적 import 로 순환 의존 회피 + Sentry DSN 미설정 시 비용 0
      void import('@/utils/sentry').then(({ captureApiError }) =>
        captureApiError(err, { path, method: init.method ?? 'GET' }),
      );
    }
    throw err;
  }

  return body as T;
}

export async function request<T>(path: string, init: RequestInit_ = {}): Promise<T> {
  const token = init.skipAuth ? null : handlers.getAccessToken();
  try {
    return await rawRequest<T>(path, init, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !init.skipAuth) {
      const fresh = await handlers.onUnauthorized();
      if (fresh) {
        return await rawRequest<T>(path, init, fresh);
      }
    }
    throw e;
  }
}

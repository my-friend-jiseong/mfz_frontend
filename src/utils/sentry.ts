import * as Sentry from '@sentry/react-native';
import { ApiError, NetworkError } from '@/api';

// Sentry 초기화 — DSN 환경변수가 있을 때만 활성. .env 가 없는 환경에선 no-op.
// PII 보호: beforeSend 에서 user/refreshToken 등 잠재적 secret 필드 sanitize.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (!DSN) return; // DSN 없으면 비활성

  Sentry.init({
    dsn: DSN,
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // 이메일/이름 등 PII 가 user 컨텍스트에 들어가 있으면 제거
      if (event.user) {
        event.user = { id: event.user.id };
      }
      // request body 에 token / password 가 있으면 마스킹
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        const sanitized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          if (/(password|token|secret|auth)/i.test(k)) {
            sanitized[k] = '[REDACTED]';
          } else {
            sanitized[k] = v;
          }
        }
        event.request.data = sanitized;
      }
      return event;
    },
  });
  initialized = true;
}

/**
 * ApiError / NetworkError 를 Sentry 로 보낼 때 code 를 fingerprint 로 사용해
 * 메시지가 바뀌어도 같은 그룹으로 묶이도록.
 */
export function captureApiError(e: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  if (e instanceof ApiError) {
    // 4xx 는 사용자 입력 / 정상 분기 → 캡처 X. 5xx 만 캡처.
    if (e.status < 500) return;
    Sentry.withScope((scope) => {
      scope.setTag('api.code', e.code ?? 'unknown');
      scope.setTag('api.status', String(e.status));
      scope.setFingerprint(['api', e.code ?? 'unknown']);
      if (context) scope.setContext('api.context', context);
      if (e.details) scope.setContext('api.details', e.details);
      Sentry.captureException(e);
    });
    return;
  }
  if (e instanceof NetworkError) {
    Sentry.withScope((scope) => {
      scope.setTag('api.code', 'network');
      scope.setFingerprint(['api', 'network']);
      Sentry.captureException(e);
    });
    return;
  }
  Sentry.captureException(e);
}

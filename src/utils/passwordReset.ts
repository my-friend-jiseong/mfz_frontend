import { auth } from '@/api/endpoints/auth';
import { ApiError, errorCode, localizeError } from '@/api/errors';

// 비밀번호 찾기(11-4~11-8) 화면이 쓰는 호출 묶음. 서버 응답을 화면이 그릴 상태로 바꿔 준다.
//
// 서버에 아직 API 가 없어서(backend-backlog '2차 개편 요청' A) 개발 빌드에서만 `?mock=` 으로
// 가짜 응답을 고를 수 있다 — 검토자가 11-6·11-7·11-10·11-11 상태를 직접 띄워 보기 위한 것.
//   mock=ok      모두 성공
//   mock=wrong   인증번호가 틀림(남은 횟수 4 → 0, 다섯 번째에 11-7)
//   mock=locked  처음부터 5번 틀린 상태(11-7)
//   mock=expired 처음부터 5분이 지난 상태(11-10)
//   mock=limited 발송 제한(11-11, 42분 뒤)
// 운영 빌드(__DEV__ false)에서는 mock 값을 무시한다.

export type ResetMock = 'ok' | 'wrong' | 'locked' | 'expired' | 'limited';

const MOCKS: readonly ResetMock[] = ['ok', 'wrong', 'locked', 'expired', 'limited'];

export function parseResetMock(v: unknown): ResetMock | undefined {
  if (!__DEV__) return undefined;
  return typeof v === 'string' && (MOCKS as readonly string[]).includes(v) ? (v as ResetMock) : undefined;
}

export const CODE_LENGTH = 6;
export const MAX_ATTEMPTS = 5;
const DEFAULT_EXPIRES_SEC = 300;
const DEFAULT_RESEND_SEC = 60;

export type RequestOutcome =
  | { ok: true; expiresInSec: number; resendAfterSec: number }
  | { ok: false; kind: 'rate_limited'; retryAfterMinutes: number }
  | { ok: false; kind: 'other'; error: string };

export type VerifyOutcome =
  | { ok: true; resetToken: string }
  | { ok: false; kind: 'invalid'; remainingAttempts: number }
  | { ok: false; kind: 'expired' | 'exceeded' }
  | { ok: false; kind: 'other'; error: string };

export type ConfirmOutcome =
  | { ok: true }
  | { ok: false; kind: 'password' | 'confirm' | 'token'; error: string }
  | { ok: false; kind: 'other'; error: string };

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const details = (e: unknown) => (e instanceof ApiError ? e.details ?? {} : {});

// mock=wrong 의 남은 횟수 — 새 인증번호를 받으면 처음으로.
let mockRemaining = MAX_ATTEMPTS;
const wait = () => new Promise((r) => setTimeout(r, 300));

// 인증번호 확인 → 새 비밀번호 화면으로 넘기는 1회용 토큰. URL 에 싣지 않으려고 메모리에만 둔다.
let resetToken: string | null = null;
export const resetTokenHolder = {
  set: (t: string | null) => {
    resetToken = t;
  },
  get: () => resetToken,
};

export async function requestResetCode(email: string, mock?: ResetMock): Promise<RequestOutcome> {
  if (mock) {
    await wait();
    if (mock === 'limited') return { ok: false, kind: 'rate_limited', retryAfterMinutes: 42 };
    mockRemaining = MAX_ATTEMPTS;
    return { ok: true, expiresInSec: DEFAULT_EXPIRES_SEC, resendAfterSec: DEFAULT_RESEND_SEC };
  }
  try {
    const r = await auth.passwordResetRequest({ email });
    return {
      ok: true,
      expiresInSec: num(r?.expiresInSec, DEFAULT_EXPIRES_SEC),
      resendAfterSec: num(r?.resendAfterSec, DEFAULT_RESEND_SEC),
    };
  } catch (e) {
    if (errorCode(e) === 'password_reset_rate_limited') {
      return { ok: false, kind: 'rate_limited', retryAfterMinutes: num(details(e).retryAfterMinutes, 60) };
    }
    return { ok: false, kind: 'other', error: localizeError(e) };
  }
}

export async function verifyResetCode(email: string, code: string, mock?: ResetMock): Promise<VerifyOutcome> {
  if (mock) {
    await wait();
    if (mock === 'ok') return { ok: true, resetToken: 'mock-token' };
    if (mock === 'expired') return { ok: false, kind: 'expired' };
    if (mock === 'locked') return { ok: false, kind: 'exceeded' };
    mockRemaining -= 1;
    return mockRemaining <= 0 ? { ok: false, kind: 'exceeded' } : { ok: false, kind: 'invalid', remainingAttempts: mockRemaining };
  }
  try {
    const r = await auth.passwordResetVerify({ email, code });
    return { ok: true, resetToken: r.resetToken };
  } catch (e) {
    const c = errorCode(e);
    if (c === 'password_reset_code_invalid') {
      const remaining = num(details(e).remainingAttempts, 0);
      return remaining > 0 ? { ok: false, kind: 'invalid', remainingAttempts: remaining } : { ok: false, kind: 'exceeded' };
    }
    if (c === 'password_reset_code_expired') return { ok: false, kind: 'expired' };
    if (c === 'password_reset_attempts_exceeded') return { ok: false, kind: 'exceeded' };
    return { ok: false, kind: 'other', error: localizeError(e) };
  }
}

export async function confirmNewPassword(
  token: string,
  newPassword: string,
  newPasswordConfirm: string,
  mock?: ResetMock,
): Promise<ConfirmOutcome> {
  if (mock) {
    await wait();
    return { ok: true };
  }
  try {
    await auth.passwordResetConfirm({ resetToken: token, newPassword, newPasswordConfirm });
    return { ok: true };
  } catch (e) {
    const c = errorCode(e);
    const error = localizeError(e);
    if (c === 'password_policy_violation') return { ok: false, kind: 'password', error };
    if (c === 'password_confirm_mismatch') return { ok: false, kind: 'confirm', error };
    if (c === 'password_reset_token_invalid') return { ok: false, kind: 'token', error };
    return { ok: false, kind: 'other', error };
  }
}

/** 04:52 — 남은 시간(11-5). */
export function formatMmSs(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 0:52 — 다시 보내기까지 남은 시간(11-5). */
export function formatMSs(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

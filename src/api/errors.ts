// 백엔드 Phase 7 — 통일된 에러 응답 shape:
//   { code: "snake_case", message: "한국어", fields?: {...}, details?: {...} }
//
// - code: 분기 키 (snake_case)
// - message: 사용자 표시용 한국어 (백엔드가 직접 제공)
// - fields: 폼 검증 사유 (있을 때만, 현재는 contract 만 열려 있음)
// - details: confirm 패턴 등 부가 정보 (예: { tripId }, { duplicateCount }, { visitCount })
//
// 백엔드가 이미 한국어 message 를 보내므로 ERROR_MESSAGES 표는 message 누락/재정의용 안전망.

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;
  readonly body: unknown;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    fields?: Record<string, string>;
    details?: Record<string, unknown>;
    body?: unknown;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.fields = args.fields;
    this.details = args.details;
    this.body = args.body;
  }

  /** code === expected 비교 (가이드의 ApiHttpError.is 와 동치) */
  is(code: string): boolean {
    return this.code === code;
  }
}

export class NetworkError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super('네트워크 오류 — 서버에 연결할 수 없습니다');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

// confirm 패턴 details 의 알려진 타입.
export type ConfirmZeroVisitsDetails = { tripId: string };
export type DuplicateAddressDetails = { duplicateCount: number };
export type HasRelatedVisitsDetails = { visitCount: number };

// 백엔드 message 가 누락되거나 토스트용으로 재정의가 필요할 때만 사용되는 안전망.
// Phase 7 부터 백엔드가 한국어 message 를 직접 주기 때문에 1차 소스는 ApiError.message.
const ERROR_MESSAGES: Record<string, string> = {
  // 회원가입
  email_already_exists: '이미 가입된 이메일입니다',
  password_too_short: '비밀번호는 10자 이상 + 영대/영소/숫자/특수문자 중 3종 조합이어야 합니다',
  password_confirm_mismatch: '비밀번호 확인이 일치하지 않습니다',
  terms_required: '필수 약관 동의가 필요합니다',
  invalid_email: '이메일 형식이 올바르지 않습니다',
  email_invalid: '이메일 형식이 올바르지 않습니다',
  name_required: '이름을 입력해주세요',
  // 로그인 / 인증
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다',
  auth_header_missing: '로그인이 필요합니다',
  token_invalid_or_expired: '세션이 만료되었습니다. 다시 로그인해주세요',
  session_inactive: '세션이 종료되었습니다. 다시 로그인해주세요',
  session_idle_timeout: '오래 사용하지 않아 세션이 종료되었습니다',
  session_not_active: '세션이 종료되었습니다',
  refresh_token_invalid: '세션이 만료되었습니다. 다시 로그인해주세요',
  refresh_token_superseded: '다른 기기에서 새로 로그인되었습니다',
  all_sessions_revoked: '보안상의 이유로 모든 세션이 종료되었습니다',
  session_id_missing: '세션 정보가 없습니다. 다시 로그인해주세요',
  user_not_found: '계정을 찾을 수 없습니다',
  // 외근 (Trip)
  already_active_trip: '이미 진행 중인 외근이 있습니다',
  no_active_trip: '진행 중인 외근이 없습니다',
  trip_not_active: '외근 시작 후 체크인 가능합니다',
  confirm_required_zero_visits: '방문 기록이 없습니다. 종료하시겠습니까?',
  already_ended_trip: '외근이 이미 종료되었습니다',
  // 현장 (Field)
  field_not_found: '현장을 찾을 수 없습니다',
  coordinates_out_of_korea: '대한민국 영역 내 좌표만 입력 가능합니다',
  duplicate_address_warning_required: '같은 주소의 현장이 이미 있습니다',
  has_related_visits: '방문 기록이 있어 삭제할 수 없습니다',
  forbidden_done_to_pending: '관리자만 변경할 수 있습니다',
  forbidden_assignee_update: '관리자만 변경할 수 있습니다',
  // 방문 (Visit)
  visit_status_invalid: '방문 결과를 선택해주세요',
  visit_status_reason_required: '"기타" 선택 시 사유를 10자 이상 입력해주세요',
  photo_format_invalid: '지원하지 않는 사진 형식입니다 (JPEG/PNG)',
  photo_size_exceeded: '사진 크기가 제한을 초과했습니다',
  // 보고서 (Reports) — ERD v2: title 필수, content/공유 제거.
  report_title_required: '제목을 입력해주세요',
  report_title_length_invalid: '제목 길이가 올바르지 않습니다',
  report_notes_required: '메모를 입력해주세요',
  ai_analysis_empty: 'AI 분석 결과가 비어 있습니다. 메모·사진을 보강 후 다시 시도해주세요',
  report_tripid_immutable: '연결 외근은 변경할 수 없습니다',
  report_not_found: '이미 삭제되었거나 찾을 수 없는 보고서입니다',
  report_forbidden: '본인 작성 보고서만 변경할 수 있습니다',
  // 프로젝트 (Projects) — ERD v2 신규
  project_name_required: '프로젝트 이름을 입력해주세요',
  project_status_invalid: '프로젝트 상태 값이 올바르지 않습니다',
  project_not_found: '프로젝트를 찾을 수 없습니다',
  // 외부 서비스
  kakao_provider_unavailable: '주소 검색 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요',
  // 일반
  validation_failed: '입력값이 올바르지 않습니다',
  internal_server_error: '일시적인 오류가 발생했습니다',
};

/**
 * 사용자 표시용 한국어 메시지 추출.
 * 우선순위: ApiError.message (백엔드 한국어) → ERROR_MESSAGES[code] 안전망 → fallback.
 */
export function localizeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.message && e.message.trim() && !/^HTTP \d+$/.test(e.message)) {
      return e.message;
    }
    if (e.code && ERROR_MESSAGES[e.code]) return ERROR_MESSAGES[e.code];
    return e.message || `오류 (HTTP ${e.status})`;
  }
  if (e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류';
}

/** 분기 키로 사용 — 예: errorCode(e) === 'email_already_exists' */
export function errorCode(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  return e.code ?? null;
}

/**
 * Phase 7 contract 의 error.fields ({ 필드명: 사유 }) 를 폼 측에 적용.
 * react-hook-form 등의 setError(name, { message }) 시그니처에 맞춰진 setter 를 받음.
 *
 * 사용:
 *   try { ... } catch (e) {
 *     if (applyFieldErrors(e, (name, msg) => form.setError(name, { message: msg }))) return;
 *     toast(localizeError(e));
 *   }
 *
 * 반환: fields 가 있어 처리됐으면 true, 그 외 false (호출자가 일반 에러로 처리).
 * 현재 백엔드 라우트는 fields 를 채우지 않지만, 향후 채우기 시작하면 자동 동작.
 */
export function applyFieldErrors(
  e: unknown,
  setFieldError: (name: string, message: string) => void,
): boolean {
  if (!(e instanceof ApiError) || !e.fields) return false;
  const entries = Object.entries(e.fields);
  if (entries.length === 0) return false;
  for (const [name, reason] of entries) {
    setFieldError(name, reason);
  }
  return true;
}

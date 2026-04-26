// 백엔드 에러 응답 정규화.
//
// 실측 응답 형태(Phase 2 검증):
//   { "error": "snake_case_id" }                    — 검증 실패 4xx (영문 코드만)
//   { "error": "...", "code": "confirm_required_zero_visits" } — confirm 분기
//   네트워크 실패 시 fetch 가 throw → ApiError 로 감싸 던짐
//
// 백엔드는 {error: "코드"} 형태로 영문 식별자를 보냄 (한국어 메시지·별도 code 필드 없음).
// 클라이언트가 식별자를 한국어 메시지로 매핑해 사용자에게 표시.

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;

  constructor(args: { status: number; message: string; code?: string; body?: unknown }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.body = args.body;
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

// 영문 식별자 → 한국어 메시지 매핑.
// 신규 코드 발견 시 이 표에 추가하면 화면이 자동으로 친절한 메시지 표시.
const ERROR_MESSAGES: Record<string, string> = {
  // 회원가입
  email_already_exists: '이미 가입된 이메일입니다',
  password_too_short: '비밀번호는 10자 이상 + 영대/영소/숫자/특수문자 중 3종 조합이어야 합니다',
  password_confirm_mismatch: '비밀번호 확인이 일치하지 않습니다',
  terms_required: '필수 약관 동의가 필요합니다',
  invalid_email: '이메일 형식이 올바르지 않습니다',
  name_required: '이름을 입력해주세요',
  // 로그인
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다',
  // 외근
  active_trip_exists: '이미 진행 중인 외근이 있습니다',
  no_active_trip: '진행 중인 외근이 없습니다',
  confirm_required_zero_visits: '방문 기록이 없습니다. 종료하시겠습니까?',
  // 권한
  forbidden: '권한이 없습니다',
  unauthorized: '로그인이 필요합니다',
  // 검증 일반
  validation_failed: '입력값이 올바르지 않습니다',
};

/** 백엔드 에러 식별자에 매핑된 한국어 메시지가 있으면 그것, 없으면 원본 message */
export function localizeError(e: unknown): string {
  if (e instanceof ApiError) {
    const key = (e.code ?? e.message)?.trim();
    if (key && ERROR_MESSAGES[key]) return ERROR_MESSAGES[key];
    return e.message || `오류 (HTTP ${e.status})`;
  }
  if (e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류';
}

/** 에러의 영문 식별자만 (분기 키로 사용 — 예: code === 'email_already_exists') */
export function errorCode(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  return e.code ?? e.message ?? null;
}

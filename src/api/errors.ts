// 백엔드 에러 응답 정규화.
//
// 실측 응답 형태(스웨거 명세 없음, smoke test로 확인):
//   { "error": "메시지" }                          — 일반 4xx/5xx
//   { "error": "...", "code": "confirm_required_zero_visits" } — 확인 필요 케이스
//   네트워크 실패 시 fetch 가 throw → ApiError 로 감싸 던짐

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

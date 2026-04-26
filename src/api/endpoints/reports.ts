import { request } from '../client';

// /api/reports/generate — Gemini AI 자동 생성 + Word 출력
// 스웨거: multipart 입력 (프런트 명세상의 "수기 작성"은 백엔드 미구현)
// 정확한 multipart 필드명·응답 shape 미캡처 — 첫 호출 시 정정 필요.

export interface GenerateReportInput {
  tripId: string;
  // 추가 첨부물 (선택). 백엔드 필드명 확정 전까지 호출자가 직접 FormData 구성 권장.
}

export const reports = {
  // 명시적 multipart 빌드는 호출 측에서 (FormData 필드명 미확정 상태)
  generate: (form: FormData) =>
    request<unknown>('/api/reports/generate', {
      method: 'POST',
      body: form,
      multipart: true,
    }),
};

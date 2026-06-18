import { request } from '../client';

// ERD v2 정렬 — visits 는 체크인 기록(trip·field·시각·status)만.
//   - 체크인: fieldId 만 (siteName·location 제거).
//   - result_status·status_reason·memo·첨부 컬럼 제거 (memos/field_photos 는 현장 전용).
//   - PATCH /api/visits/:id/status 존속 여부·body 는 §8 확인 대상 — 단일 status 로 가정.

export interface CheckInBody {
  fieldId: string;
}

export interface CheckInResponse {
  tripId: string;
  visitId: string;
  fieldId: string;
  visitedAt: string;
  message?: string;       // v2 응답엔 없음 — optional
}

export interface VisitDetailResponse {
  tripId: string;
  visitId: string;
  fieldId: string;
  siteName?: string;        // 현장명 (field.name)
  visitedAt: string;
  status: string;           // visits.status
  // backend-backlog §21 — release 2026-06: status='other' 사유 영속·노출.
  reason?: string;
}

export const visits = {
  checkIn: (body: CheckInBody) =>
    request<CheckInResponse>('/api/visits/check-in', { method: 'POST', body }),

  // v2 검증(2026-05-28): body 는 { status, reason? }. status='other' 면 reason 10자 이상 필수
  // (visit_status_reason_required). 응답: { visitId, status, resultStatus(normal|abnormal) auto }.
  setStatus: (visitId: string, status: string, reason?: string) =>
    request<unknown>(`/api/visits/${visitId}/status`, {
      method: 'PATCH',
      body: { status, ...(reason ? { reason } : {}) },
    }),

  detail: (tripId: string, visitId: string) =>
    request<VisitDetailResponse>(`/api/trips/${tripId}/visits/${visitId}`),
};

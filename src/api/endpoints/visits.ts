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
}

export const visits = {
  checkIn: (body: CheckInBody) =>
    request<CheckInResponse>('/api/visits/check-in', { method: 'POST', body }),

  // ERD v2: result_status/status_reason 제거 → 단일 status. 엔드포인트 존속·body 는 §8 확인.
  setStatus: (visitId: string, status: string) =>
    request<unknown>(`/api/visits/${visitId}/status`, {
      method: 'PATCH',
      body: { status },
    }),

  detail: (tripId: string, visitId: string) =>
    request<VisitDetailResponse>(`/api/trips/${tripId}/visits/${visitId}`),
};

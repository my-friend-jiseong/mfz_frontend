import { request } from '../client';

// 주의: memo 텍스트 필드명, status enum 값은 smoke test 시점 미확정.
//   - memo body: `{ content }` 거부됨. `text`/`body`/`memo` 후보 — 첫 호출 시 재확인 필요.
//   - status 한글 enum 거부됨. `resultStatus` 와 영문 값 가능성 — 백엔드 소스 확인 필요.
// 우선 가장 가능성 높은 패턴으로 작성하고, 실 호출 시 ApiError 메시지로 정정.

export interface CheckInBody {
  fieldId: string;
  siteName?: string;
  location?: { lat: number; lng: number };
}

export interface CheckInResponse {
  tripId: string;
  visitId: string;
  fieldId: string;
  visitedAt: string;
  message: string;
}

export interface VisitDetailResponse {
  tripId: string;
  visitId: string;
  siteName: string;
  visitedAt: string;
  resultStatus: string; // 영문 enum (normal 등)
  status: string;       // 한글 표시값 (완료 등)
  statusReason: string | null;
  memo: string;
  attachmentCounts: { text: number; photo: number; audio: number };
  attachments: unknown[];
}

export const visits = {
  checkIn: (body: CheckInBody) =>
    request<CheckInResponse>('/api/visits/check-in', { method: 'POST', body }),

  // 우선 한글 status 로 시도. 거부되면 영문 enum 재매핑 필요.
  setStatus: (visitId: string, status: string, statusReason?: string) =>
    request<unknown>(`/api/visits/${visitId}/status`, {
      method: 'PATCH',
      body: { status, ...(statusReason ? { statusReason } : {}) },
    }),

  // memo 필드명 추정: text. 거부되면 body/memo 로 폴백 필요 — 호출 측에서 ApiError 처리.
  addTextMemo: (visitId: string, text: string) =>
    request<unknown>(`/api/visits/${visitId}/memos/text`, {
      method: 'POST',
      body: { text },
    }),

  addPhoto: (visitId: string, file: { uri: string; name: string; type: string }, caption?: string) => {
    const fd = new FormData();
    // RN FormData: { uri, name, type } 객체 그대로 append 가능
    fd.append('file', file as unknown as Blob);
    if (caption) fd.append('caption', caption);
    return request<unknown>(`/api/visits/${visitId}/photos`, {
      method: 'POST',
      body: fd,
      multipart: true,
    });
  },

  addVoiceMemo: (visitId: string, file: { uri: string; name: string; type: string }) => {
    const fd = new FormData();
    fd.append('file', file as unknown as Blob);
    return request<unknown>(`/api/visits/${visitId}/voice-memos`, {
      method: 'POST',
      body: fd,
      multipart: true,
    });
  },

  detail: (tripId: string, visitId: string) =>
    request<VisitDetailResponse>(`/api/trips/${tripId}/visits/${visitId}`),
};

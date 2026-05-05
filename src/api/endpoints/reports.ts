import { request } from '../client';

// Phase 7 cut-over — 모든 reports 라우트가 raw 도메인 객체 반환 ({success, data} envelope 제거).

// list 응답 item (flat, reportId)
export interface ReportListItem {
  reportId: string;
  tripId: string | null;
  trip: { tripDate: string | null; startedAt: string | null; endedAt: string | null };
  title: string;
  contentPreview: string;
  createdAt: string;
  updatedAt: string | null;
  fileUrl: string | null;
}

export interface ReportListResponse {
  items: ReportListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
}

// detail/PATCH 응답 (flat, reportId)
export interface ReportDetailResponse {
  reportId: string;
  tripId: string | null;
  trip: { startedAt: string | null; endedAt: string | null; visitCount: number | null };
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  fileUrl: string | null;
  creator: { id: string; name: string };
}

// POST /api/reports 응답 (Phase 7 부터 raw)
export interface ReportCreateData {
  id: string;
  tripId: string | null;
  title: string;
  content: string;
  summary: string | null;
  authorUserId: string;
  status: 'draft' | 'published' | string;
  generatedByAi: boolean;
  outputFileUrl: string | null;
  shareEnabled: boolean;
  shareToken: string | null;
  sharedAt: string | null;
  shareExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateReportBody {
  title: string;
  content: string;
  summary?: string;
  tripId?: string;
}

export interface UpdateReportBody {
  title?: string;
  content?: string;
}

export interface ListReportsParams {
  page?: number;
  limit?: number;
  tripId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

// 공유 링크 응답
export interface ShareReportData {
  reportId: string;
  shareEnabled: boolean;
  shareToken: string;
  shareUrl: string;
  sharedAt: string;
  expiresAt?: string;
  shareExpiresAt?: string;
}

export interface DisableShareData {
  reportId: string;
  shareEnabled: false;
}

// AI 분석 결과 schema — 공통 필드는 typed, 모델 raw output 등 나머지는 free-form 통과.
// 백엔드 모델 변경에 안정적 (필드 추가는 unknown 으로 받아도 기존 코드 안 깨짐).
export interface ReportAnalysis {
  summary?: string;
  keypoints?: string[];
  recommendations?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | string;
  raw?: string;
  // 미래 확장 — 모델 응답에 추가 필드가 와도 흡수
  [key: string]: unknown;
}

// Phase 3 §2.1 — generate 응답 (Phase 7 부터 raw, message 는 동위 필드)
export interface ReportGenerateData {
  id: string;
  tripId: string | null;
  title: string;
  content: string;
  summary: string;
  generatedByAi: boolean;
  outputFileUrl: string;
  fileUrl?: string;
  downloadUrl?: string;
  outputFileName?: string;
  analysis?: ReportAnalysis;
  generationMetadata?: { model?: string; tokens?: number | null; elapsedMs?: number };
  message?: string;
}

export const reports = {
  list: (params?: ListReportsParams) =>
    request<ReportListResponse>('/api/reports', { query: params }),

  detail: (reportId: string) =>
    request<ReportDetailResponse>(`/api/reports/${reportId}`),

  create: (body: CreateReportBody) =>
    request<ReportCreateData>('/api/reports', { method: 'POST', body }),

  update: (reportId: string, body: UpdateReportBody) =>
    request<ReportDetailResponse>(`/api/reports/${reportId}`, {
      method: 'PATCH',
      body,
    }),

  remove: (reportId: string) =>
    request<null>(`/api/reports/${reportId}`, { method: 'DELETE' }),

  share: (reportId: string) =>
    request<ShareReportData>(`/api/reports/${reportId}/share`, {
      method: 'POST',
      body: {},
    }),

  /** Phase 3 §2.2 — 공유 토큰 무효화 */
  disableShare: (reportId: string) =>
    request<DisableShareData>(`/api/reports/${reportId}/share`, {
      method: 'DELETE',
    }),

  getShared: (token: string) =>
    request<ReportCreateData>(`/api/reports/shared/${token}`, { skipAuth: true }),

  /**
   * Phase 3 §2.1 — AI 보고서 생성·저장. multipart body:
   *  notes (필수), title, extraNotes, tripId, location, before_photo, after_photo
   */
  generate: (form: FormData) =>
    request<ReportGenerateData>('/api/reports/generate', {
      method: 'POST',
      body: form,
      multipart: true,
    }),
};

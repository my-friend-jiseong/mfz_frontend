import { request } from '../client';
import type { FieldReport } from '@/types/entities';

// ERD v2 정렬 — reports 슬림화:
//   - content/summary/status/share/AI·soft-delete·단일사진 컬럼 제거.
//   - title + trip_id + output_file_url + created_by 중심. 삭제는 hard delete.
//   - 본문은 fieldReports(현장별 전·중·후 사진) 로 분리 — /api/reports/:id/field-reports.

export interface ReportListItem {
  reportId: string;
  tripId: string | null;
  trip: { tripDate: string | null; startedAt: string | null; endedAt: string | null };
  title: string;
  createdAt: string;
  updatedAt: string | null;
  outputFileUrl: string | null;
}

export interface ReportListResponse {
  items: ReportListItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage: string | null;
}

export interface ReportDetailResponse {
  reportId: string;
  tripId: string | null;
  trip: { startedAt: string | null; endedAt: string | null; visitCount: number | null };
  title: string;
  outputFileUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  creator: { id: string; name: string };
  fieldReports: FieldReport[];
}

// POST /api/reports 응답
export interface ReportCreateData {
  id: string;
  tripId: string | null;
  title: string;
  outputFileUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportBody {
  // ERD v2: title 필수. content/summary 제거. outputFileUrl 선택.
  title: string;
  tripId?: string;
  outputFileUrl?: string;
}

export interface UpdateReportBody {
  title?: string;
  outputFileUrl?: string;
}

export interface ListReportsParams {
  page?: number;
  limit?: number;
  tripId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

// ----- 현장별 보고(field_reports) — 전·중·후 사진 + 캡션 -----
// 요청/응답 정확한 필드명·사진 업로드 방식(URL vs multipart)은 §8 확인 대상.
// 우선 URL 참조 기반(JSON)으로 가정 — field_photos 업로드 후 그 URL 을 연결.
export interface FieldReportInput {
  fieldId: string;
  title?: string;
  beforePhotoUrl?: string;
  beforePhotoCaption?: string;
  pendingPhotoUrl?: string;
  pendingPhotoCaption?: string;
  afterPhotoUrl?: string;
  afterPhotoCaption?: string;
}

// ----- AI 보고서 생성 -----
// ERD v2: 본문 content 컬럼 없음. fieldId 제공 시 field_report 에 before/after 저장.
// 응답 형태가 재정의됐을 수 있어 방어적 optional (§8).
export interface ReportAnalysis {
  summary?: string;
  keypoints?: string[];
  recommendations?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | string;
  raw?: string;
  [key: string]: unknown;
}

export interface ReportGenerateData {
  id: string;
  reportId?: string;
  tripId: string | null;
  title: string;
  outputFileUrl?: string;
  fileUrl?: string;
  downloadUrl?: string;
  outputFileName?: string;
  fieldReport?: FieldReport;
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

  // ERD v2: hard delete.
  remove: (reportId: string) =>
    request<null>(`/api/reports/${reportId}`, { method: 'DELETE' }),

  // ----- field-reports CRUD -----
  listFieldReports: (reportId: string) =>
    request<{ items: FieldReport[] }>(`/api/reports/${reportId}/field-reports`),

  addFieldReport: (reportId: string, body: FieldReportInput) =>
    request<FieldReport>(`/api/reports/${reportId}/field-reports`, {
      method: 'POST',
      body,
    }),

  updateFieldReport: (reportId: string, fieldReportId: string, body: Partial<FieldReportInput>) =>
    request<FieldReport>(`/api/reports/${reportId}/field-reports/${fieldReportId}`, {
      method: 'PATCH',
      body,
    }),

  removeFieldReport: (reportId: string, fieldReportId: string) =>
    request<null>(`/api/reports/${reportId}/field-reports/${fieldReportId}`, {
      method: 'DELETE',
    }),

  /** AI 보고서 생성·저장. multipart body: notes(필수), title, tripId, fieldId, before_photo, after_photo */
  generate: (form: FormData) =>
    request<ReportGenerateData>('/api/reports/generate', {
      method: 'POST',
      body: form,
      multipart: true,
    }),
};

import { request } from '../client';
import { appendUploadFile } from '@/utils/media';
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
  // backend-backlog §20 — release 2026-06-19: 위치도 이미지 URL(미첨부 시 null).
  overviewMapUrl?: string | null;
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
  // backend-backlog §20 — release 2026-06-19: 위치도 이미지 URL(미첨부 시 null).
  overviewMapUrl?: string | null;
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
  authorUserId: string;   // POST /api/reports 는 authorUserId 로 응답 (검증 2026-05-28)
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

// backend-backlog §18 — release 2026-06: 외근 visits 별 FieldReport 일괄 스캐폴드 단축.
export interface FromTripBody {
  title: string;
}
export interface FromTripResponse {
  reportId: string;
  fieldReports: FieldReport[];
}

// backend-backlog §6 — release 2026-06: field_reports → Word 통합 생성.
export interface ExportWordResponse {
  outputFileUrl: string;
  downloadUrl?: string;
  photoCount?: number;
}

// backend-backlog §19 — release 2026-07-26: PDF export.
// Word 와 달리 결과 URL 이 서버에 영속되지 않는다(reports 에 pdf 컬럼 없음, 스펙도
// "Word outputFileUrl 은 변경하지 않음" 명시). 그래서 이 응답 URL 이 유일한 출처 —
// 호출 측이 곧바로 열어야 하고, 화면 재진입 후엔 다시 생성해야 한다.
// OpenAPI 는 200 본문을 미기재하지만 실제로는 반환(운영 관례) → 필드 전부 optional.
export interface ExportPdfResponse {
  url?: string;
  downloadUrl?: string;
  format?: string;
}

// backend-backlog §20 — release 2026-06-19: 위치도 업로드 응답.
export interface OverviewPhotoResponse {
  reportId: string;
  overviewMapUrl: string;
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

// AI 보고서 생성 (POST /api/reports/generate) — 2026-05-31 결정 §1: 완전 제거.
// 사유: QA #14·#15 + 운영 500 (backlog §13) + 새 양식엔 본문 자체가 없음.
// ReportGenerateData / ReportAnalysis / reports.generate 모두 본 사이클에서 삭제.

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

  // backend-backlog §18 — release 2026-06: 보고서 + 현장보고 스캐폴드 단축 생성.
  createFromTrip: (tripId: string, body: FromTripBody) =>
    request<FromTripResponse>(`/api/reports/from-trip/${tripId}`, {
      method: 'POST',
      body,
    }),

  // backend-backlog §6 — release 2026-06: field_reports → Word 생성/재생성.
  exportWord: (reportId: string, regenerate = false) =>
    request<ExportWordResponse>(`/api/reports/${reportId}/export/word`, {
      method: 'POST',
      body: regenerate ? { regenerate: true } : {},
    }),

  // backend-backlog §19 — release 2026-07-26: field_reports → PDF 생성(위치도·전중후 사진).
  // 전용 경로(/export/pdf)를 쓴다 — /export?format=pdf 도 있지만 한 가지만 유지해 분기를 줄인다.
  exportPdf: (reportId: string) =>
    request<ExportPdfResponse>(`/api/reports/${reportId}/export/pdf`, {
      method: 'POST',
      body: {},
    }),

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

  // backend-backlog §6 — release 2026-06 권장: 슬롯별 사진 직업로드(서버 압축).
  // 파일 파트 직렬화 플랫폼 분기는 appendUploadFile(media) 단일 출처.
  // 응답 본문은 미보장(OpenAPI 미기재) → 호출 측은 loadDetail 로 슬롯 URL 재동기화.
  uploadFieldReportPhoto: async (
    reportId: string,
    fieldReportId: string,
    p: {
      slot: 'before' | 'pending' | 'after';
      file: { uri: string; name: string; type: string };
      caption?: string;
    },
  ) => {
    const fd = new FormData();
    fd.append('slot', p.slot);
    if (p.caption) fd.append('caption', p.caption);
    await appendUploadFile(fd, 'file', p.file);
    return request<FieldReport>(
      `/api/reports/${reportId}/field-reports/${fieldReportId}/photos`,
      { method: 'POST', body: fd, multipart: true },
    );
  },

  // backend-backlog §20 — release 2026-06-19: 위치도(개요 지도) 이미지 업로드.
  // 프론트가 네이티브 캡처한 위치도 → 서버 압축 후 reports.overview_map_url 갱신,
  // export/word 시 문서 최상단 임베드. 재업로드 시 백엔드가 outputFileUrl 을 null 로
  // 초기화 → Word 재생성 필요. 파일 파트 직렬화는 appendUploadFile(media) 단일 출처.
  uploadOverviewPhoto: async (
    reportId: string,
    file: { uri: string; name: string; type: string },
  ) => {
    const fd = new FormData();
    await appendUploadFile(fd, 'file', file);
    return request<OverviewPhotoResponse>(
      `/api/reports/${reportId}/overview-photo`,
      { method: 'POST', body: fd, multipart: true },
    );
  },
};

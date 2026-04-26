import { request } from '../client';

// docs/_swagger_responses.md §8 — Reports endpoint 별 응답 shape 비일관 (어댑터로 흡수)

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

// POST 응답 ({ success, data: { id, ... } } wrapper). 일부 백엔드 변종이 reportId 로
// 보낼 가능성이 있어 양쪽 모두 옵셔널.
export interface ReportCreateData {
  id?: string;
  reportId?: string;
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** id 와 reportId 중 정의된 쪽을 반환 (백엔드 응답 변종 흡수). */
export function reportDataId(d: ReportCreateData): string {
  return d.id ?? d.reportId ?? '';
}

interface CreateWrapped {
  success: boolean;
  data: ReportCreateData;
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

// 공유 링크 응답 — Phase 3 §2.2 보강 (expiresAt/shareExpiresAt 추가, 7일 만료)
export interface ShareReportData {
  reportId: string;
  shareEnabled: boolean;
  shareToken: string;
  shareUrl: string;
  sharedAt: string;
  expiresAt?: string;
  shareExpiresAt?: string;
}
interface ShareWrapped {
  success: boolean;
  data: ShareReportData;
}

export interface DisableShareData {
  reportId: string;
  shareEnabled: false;
}
interface DisableShareWrapped {
  success: boolean;
  data: DisableShareData;
}

// 비인증 공유 보고서 조회
interface SharedReportWrapped {
  success: boolean;
  data: ReportCreateData;
}

// Phase 3 §2.1 — generate 응답
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
  analysis?: unknown;
  generationMetadata?: { model?: string; tokens?: number | null; elapsedMs?: number };
}
interface GenerateWrapped {
  success: boolean;
  message?: string;
  data: ReportGenerateData;
}

// 백엔드가 200 status 로 { success:false, error } 보내는 회귀를 흡수.
// 진짜 list 본문이 안 오면 빈 결과로 폴백해 화면 깨짐 방지.
const EMPTY_LIST: ReportListResponse = {
  items: [],
  pagination: { page: 1, limit: 50, total: 0, hasNext: false },
  emptyMessage: null,
};

export const reports = {
  list: async (params?: ListReportsParams): Promise<ReportListResponse> => {
    const res = (await request<ReportListResponse | { success: false; error?: string }>(
      '/api/reports',
      { query: params },
    )) as ReportListResponse & { success?: boolean };
    if (res && res.success === false) return EMPTY_LIST;
    if (!res || !Array.isArray((res as ReportListResponse).items)) return EMPTY_LIST;
    return res as ReportListResponse;
  },

  detail: (reportId: string) =>
    request<ReportDetailResponse>(`/api/reports/${reportId}`),

  create: async (body: CreateReportBody): Promise<ReportCreateData> => {
    const res = await request<CreateWrapped>('/api/reports', {
      method: 'POST',
      body,
    });
    return res.data;
  },

  update: (reportId: string, body: UpdateReportBody) =>
    request<ReportDetailResponse>(`/api/reports/${reportId}`, {
      method: 'PATCH',
      body,
    }),

  remove: (reportId: string) =>
    request<null>(`/api/reports/${reportId}`, { method: 'DELETE' }),

  share: async (reportId: string): Promise<ShareReportData> => {
    const res = await request<ShareWrapped>(`/api/reports/${reportId}/share`, {
      method: 'POST',
      body: {},
    });
    return res.data;
  },

  /** Phase 3 §2.2 — 공유 토큰 무효화 */
  disableShare: async (reportId: string): Promise<DisableShareData> => {
    const res = await request<DisableShareWrapped>(
      `/api/reports/${reportId}/share`,
      { method: 'DELETE' },
    );
    return res.data;
  },

  getShared: async (token: string): Promise<ReportCreateData> => {
    const res = await request<SharedReportWrapped>(
      `/api/reports/shared/${token}`,
      { skipAuth: true },
    );
    return res.data;
  },

  /**
   * Phase 3 §2.1 — AI 보고서 생성·저장. multipart body:
   *  notes (필수), title, extraNotes, tripId, location, before_photo, after_photo
   */
  generate: async (form: FormData): Promise<ReportGenerateData> => {
    const res = await request<GenerateWrapped>('/api/reports/generate', {
      method: 'POST',
      body: form,
      multipart: true,
    });
    return res.data;
  },
};

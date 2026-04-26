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

// POST 응답 ({ success, data: { id, ... } } wrapper)
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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

// 공유 링크 응답
export interface ShareReportData {
  reportId: string;
  shareEnabled: boolean;
  shareToken: string;
  shareUrl: string;
  sharedAt: string;
}
interface ShareWrapped {
  success: boolean;
  data: ShareReportData;
}

// 비인증 공유 보고서 조회
interface SharedReportWrapped {
  success: boolean;
  data: ReportCreateData;
}

export const reports = {
  list: (params?: ListReportsParams) =>
    request<ReportListResponse>('/api/reports', { query: params }),

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

  getShared: async (token: string): Promise<ReportCreateData> => {
    const res = await request<SharedReportWrapped>(
      `/api/reports/shared/${token}`,
      { skipAuth: true },
    );
    return res.data;
  },

  // generate (AI 자동 생성, multipart) — 별도 PR
  generate: (form: FormData) =>
    request<unknown>('/api/reports/generate', {
      method: 'POST',
      body: form,
      multipart: true,
    }),
};

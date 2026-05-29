import { create } from 'zustand';
import type { Report } from '@/types/entities';
import { reports as reportsApi, localizeError, errorCode } from '@/api';
import type {
  ReportListItem,
  ReportDetailResponse,
  CreateReportBody,
  UpdateReportBody,
  ListReportsParams,
  ReportGenerateData,
  FieldReportInput,
} from '@/api';
import { useAuthStore } from './authStore';

type CreateResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export interface GenerateInput {
  notes: string;
  title?: string;
  tripId?: string;
  fieldId?: string;
  beforePhoto?: { uri: string; name: string; type: string };
  afterPhoto?: { uri: string; name: string; type: string };
}

type GenerateResult =
  | { ok: true; data: ReportGenerateData }
  | { ok: false; error: string };

interface ReportState {
  // 목록 표시용 (list 응답)
  reports: Report[];
  // 상세 화면 진입 시 채워지는 캐시 (fieldReports 포함)
  detailCache: Record<string, Report>;
  // id 별 detail fetch 진행 상태 — 화면이 not-found EmptyState 와 LoadingState 를
  // 구분할 수 있게. 'success' 면 detailCache 에 데이터 있음, 'missing' 이면 영구 not-found.
  detailStatus: Record<string, 'loading' | 'success' | 'missing'>;
  busy: boolean;

  hydrate: () => Promise<void>;
  refresh: (params?: ListReportsParams) => Promise<void>;
  loadDetail: (reportId: string) => Promise<Report | null>;
  create: (body: CreateReportBody) => Promise<CreateResult>;
  update: (id: string, body: UpdateReportBody) => Promise<GenericResult>;
  remove: (id: string) => Promise<GenericResult>;
  // 현장별 전·중·후 보고(field_reports) CRUD — 성공 시 상세 재로드로 fieldReports 갱신.
  addFieldReport: (reportId: string, body: FieldReportInput) => Promise<GenericResult>;
  updateFieldReport: (reportId: string, fieldReportId: string, body: Partial<FieldReportInput>) => Promise<GenericResult>;
  removeFieldReport: (reportId: string, fieldReportId: string) => Promise<GenericResult>;
  generate: (input: GenerateInput) => Promise<GenerateResult>;
  clearAll: () => void;

  getById: (id: string) => Report | undefined;
}

const describeError = localizeError;

function listItemToReport(item: ReportListItem, currentUserId: string): Report {
  return {
    id: item.reportId,
    creatorId: currentUserId, // list 응답에 creator 없음 — 본인 목록이라 현재 사용자
    tripId: item.tripId,
    title: item.title,
    outputFileUrl: item.outputFileUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function detailToReport(d: ReportDetailResponse): Report {
  return {
    id: d.reportId,
    creatorId: d.creator.id,
    tripId: d.tripId,
    title: d.title,
    outputFileUrl: d.outputFileUrl,
    fieldReports: d.fieldReports,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  detailCache: {},
  detailStatus: {},
  busy: false,

  hydrate: async () => {
    await get().refresh();
  },

  refresh: async (params) => {
    try {
      const res = await reportsApi.list(params);
      const userId = useAuthStore.getState().user?.id ?? '';
      const items = res.items.map((it) => listItemToReport(it, userId));
      set({ reports: items });
    } catch {
      // ignore
    }
  },

  loadDetail: async (reportId) => {
    set((s) => ({
      detailStatus: { ...s.detailStatus, [reportId]: 'loading' },
    }));
    try {
      const res = await reportsApi.detail(reportId);
      const r = detailToReport(res);
      set((s) => ({
        detailCache: { ...s.detailCache, [reportId]: r },
        detailStatus: { ...s.detailStatus, [reportId]: 'success' },
        reports: s.reports.map((x) => (x.id === reportId ? r : x)),
      }));
      return r;
    } catch {
      set((s) => ({
        detailStatus: { ...s.detailStatus, [reportId]: 'missing' },
      }));
      return null;
    }
  },

  create: async (body) => {
    set({ busy: true });
    try {
      const data = await reportsApi.create(body);
      const r: Report = {
        id: data.id,
        creatorId: data.authorUserId,
        tripId: data.tripId,
        title: data.title,
        outputFileUrl: data.outputFileUrl,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
      set((s) => ({
        reports: [r, ...s.reports.filter((x) => x.id !== r.id)],
        detailCache: { ...s.detailCache, [r.id]: r },
        detailStatus: { ...s.detailStatus, [r.id]: 'success' },
        busy: false,
      }));
      return { ok: true, report: r };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  update: async (id, body) => {
    set({ busy: true });
    try {
      const res = await reportsApi.update(id, body);
      const r = detailToReport(res);
      set((s) => ({
        reports: s.reports.map((x) => (x.id === id ? r : x)),
        detailCache: { ...s.detailCache, [id]: r },
        detailStatus: { ...s.detailStatus, [id]: 'success' },
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e), code: errorCode(e) ?? undefined };
    }
  },

  remove: async (id) => {
    set({ busy: true });
    try {
      await reportsApi.remove(id);
      set((s) => ({
        reports: s.reports.filter((x) => x.id !== id),
        detailCache: Object.fromEntries(
          Object.entries(s.detailCache).filter(([k]) => k !== id),
        ),
        detailStatus: { ...s.detailStatus, [id]: 'missing' },
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  addFieldReport: async (reportId, body) => {
    try {
      await reportsApi.addFieldReport(reportId, body);
      await get().loadDetail(reportId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  updateFieldReport: async (reportId, fieldReportId, body) => {
    try {
      await reportsApi.updateFieldReport(reportId, fieldReportId, body);
      await get().loadDetail(reportId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  removeFieldReport: async (reportId, fieldReportId) => {
    try {
      await reportsApi.removeFieldReport(reportId, fieldReportId);
      await get().loadDetail(reportId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  generate: async (input) => {
    set({ busy: true });
    try {
      const fd = new FormData();
      fd.append('notes', input.notes);
      if (input.title) fd.append('title', input.title);
      if (input.tripId) fd.append('tripId', input.tripId);
      if (input.fieldId) fd.append('fieldId', input.fieldId);
      if (input.beforePhoto) fd.append('before_photo', input.beforePhoto as unknown as Blob);
      if (input.afterPhoto) fd.append('after_photo', input.afterPhoto as unknown as Blob);

      const data = await reportsApi.generate(fd);

      // 생성 결과를 list 캐시·detailCache 에도 즉시 반영
      const r: Report = {
        id: data.reportId ?? data.id,
        creatorId: useAuthStore.getState().user?.id ?? '',
        tripId: data.tripId,
        title: data.title,
        outputFileUrl: data.outputFileUrl ?? data.fileUrl ?? data.downloadUrl ?? null,
        fieldReports: data.fieldReport ? [data.fieldReport] : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      set((s) => ({
        reports: [r, ...s.reports.filter((x) => x.id !== r.id)],
        detailCache: { ...s.detailCache, [r.id]: r },
        busy: false,
      }));
      return { ok: true, data };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  // 로그아웃 시 호출.
  clearAll: () =>
    set({ reports: [], detailCache: {}, detailStatus: {}, busy: false }),

  getById: (id) => get().reports.find((r) => r.id === id) ?? get().detailCache[id],
}));

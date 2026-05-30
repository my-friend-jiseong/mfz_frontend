import { create } from 'zustand';
import type { Report } from '@/types/entities';
import { reports as reportsApi, localizeError, errorCode } from '@/api';
import type {
  ReportListItem,
  ReportDetailResponse,
  CreateReportBody,
  UpdateReportBody,
  ListReportsParams,
  FieldReportInput,
} from '@/api';
import { useAuthStore } from './authStore';

type CreateResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

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
  // 보고서 생성 + 그 외근 visits 별 빈 FieldReport 자동 스캐폴드 (결정 §3).
  // visits 의 fieldId 가 빈 string 이면 skip (timeline.fieldId 누락 — backlog §16).
  createWithVisitScaffold: (
    body: CreateReportBody,
    visitFieldIds: string[],
  ) => Promise<CreateResult>;
  update: (id: string, body: UpdateReportBody) => Promise<GenericResult>;
  remove: (id: string) => Promise<GenericResult>;
  // 현장별 전·중·후 보고(field_reports) CRUD — 성공 시 상세 재로드로 fieldReports 갱신.
  addFieldReport: (reportId: string, body: FieldReportInput) => Promise<GenericResult>;
  updateFieldReport: (reportId: string, fieldReportId: string, body: Partial<FieldReportInput>) => Promise<GenericResult>;
  removeFieldReport: (reportId: string, fieldReportId: string) => Promise<GenericResult>;
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

  createWithVisitScaffold: async (body, visitFieldIds) => {
    const created = await get().create(body);
    if (!created.ok) return created;
    // unique fieldId 만, 빈 string 제외 (timeline.fieldId 누락 — backlog §16).
    const seen = new Set<string>();
    const targets = visitFieldIds.filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    // 순차 호출 — 백엔드 race 회피 + 한 건 실패해도 나머지 계속.
    for (const fieldId of targets) {
      try {
        await reportsApi.addFieldReport(created.report.id, { fieldId });
      } catch {
        // 개별 실패는 silently skip — 사용자가 상세에서 수동 추가 가능.
      }
    }
    // 스캐폴드 결과 동기화.
    await get().loadDetail(created.report.id);
    return created;
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

  // 로그아웃 시 호출.
  clearAll: () =>
    set({ reports: [], detailCache: {}, detailStatus: {}, busy: false }),

  getById: (id) => get().reports.find((r) => r.id === id) ?? get().detailCache[id],
}));

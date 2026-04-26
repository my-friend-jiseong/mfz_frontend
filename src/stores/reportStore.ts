import { create } from 'zustand';
import type { Report } from '@/types/entities';
import { reports as reportsApi, localizeError } from '@/api';
import type {
  ReportListItem,
  ReportDetailResponse,
  CreateReportBody,
  UpdateReportBody,
  ListReportsParams,
  ShareReportData,
  ReportGenerateData,
} from '@/api';
import { useAuthStore } from './authStore';

type CreateResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

type GenericResult = { ok: true } | { ok: false; error: string };

type ShareResult =
  | { ok: true; share: ShareReportData }
  | { ok: false; error: string };

export interface GenerateInput {
  notes: string;
  title?: string;
  extraNotes?: string;
  tripId?: string;
  location?: string;
  beforePhoto?: { uri: string; name: string; type: string };
  afterPhoto?: { uri: string; name: string; type: string };
}

type GenerateResult =
  | { ok: true; data: ReportGenerateData }
  | { ok: false; error: string };

interface ReportState {
  // 목록 표시용 (list 응답 — title/contentPreview 등)
  reports: Report[];
  // 상세 화면 진입 시 채워지는 캐시
  detailCache: Record<string, Report>;
  busy: boolean;

  hydrate: () => Promise<void>;
  refresh: (params?: ListReportsParams) => Promise<void>;
  loadDetail: (reportId: string) => Promise<Report | null>;
  create: (body: CreateReportBody) => Promise<CreateResult>;
  update: (id: string, body: UpdateReportBody) => Promise<GenericResult>;
  remove: (id: string) => Promise<GenericResult>;
  share: (id: string) => Promise<ShareResult>;
  disableShare: (id: string) => Promise<GenericResult>;
  generate: (input: GenerateInput) => Promise<GenerateResult>;

  getById: (id: string) => Report | undefined;
}

const describeError = localizeError;

function listItemToReport(item: ReportListItem, currentUserId: string): Report {
  return {
    id: item.reportId,
    creatorId: currentUserId, // list 응답에 creator 없음 — 본인 목록이라 현재 사용자
    tripId: item.tripId ?? '',
    title: item.title,
    content: item.contentPreview, // 목록은 preview 만 — 상세 진입 시 loadDetail 로 전체 채움
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: null,
  };
}

function detailToReport(d: ReportDetailResponse): Report {
  return {
    id: d.reportId,
    creatorId: d.creator.id,
    tripId: d.tripId ?? '',
    title: d.title,
    content: d.content,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deletedAt: null,
  };
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  detailCache: {},
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
    try {
      const res = await reportsApi.detail(reportId);
      const r = detailToReport(res);
      set((s) => ({
        detailCache: { ...s.detailCache, [reportId]: r },
        // list 항목의 content 도 풀 본문으로 보강
        reports: s.reports.map((x) => (x.id === reportId ? r : x)),
      }));
      return r;
    } catch {
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
        tripId: data.tripId ?? '',
        title: data.title,
        content: data.content,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        deletedAt: data.deletedAt,
      };
      set((s) => ({
        reports: [r, ...s.reports.filter((x) => x.id !== r.id)],
        detailCache: { ...s.detailCache, [r.id]: r },
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
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
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
        busy: false,
      }));
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  share: async (id) => {
    try {
      const data = await reportsApi.share(id);
      return { ok: true, share: data };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  disableShare: async (id) => {
    try {
      await reportsApi.disableShare(id);
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
      if (input.extraNotes) fd.append('extraNotes', input.extraNotes);
      if (input.tripId) fd.append('tripId', input.tripId);
      if (input.location) fd.append('location', input.location);
      if (input.beforePhoto) fd.append('before_photo', input.beforePhoto as unknown as Blob);
      if (input.afterPhoto) fd.append('after_photo', input.afterPhoto as unknown as Blob);

      const data = await reportsApi.generate(fd);

      // 생성 결과를 list 캐시·detailCache 에도 즉시 반영
      const r: Report = {
        id: data.id,
        creatorId: useAuthStore.getState().user?.id ?? '',
        tripId: data.tripId ?? '',
        title: data.title,
        content: data.content,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        deletedAt: null,
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

  getById: (id) => get().reports.find((r) => r.id === id) ?? get().detailCache[id],
}));

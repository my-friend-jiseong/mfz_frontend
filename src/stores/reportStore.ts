import { create } from 'zustand';
import type { Report } from '@/types/entities';
import { reports as reportsApi, localizeError, errorCode, ApiError } from '@/api';
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

// 스캐폴드 후 부분 실패를 호출 측에 전달 (F4/G8). failedFieldIds 로 어느 현장이 실패했는지
// 호출 측이 알 수 있게 — 안내 메시지에 현장명 노출 / '실패만 재시도' 액션 등 향후 확장 가능.
export type CreateWithScaffoldResult =
  | {
      ok: true;
      report: Report;
      attemptedFieldIds: string[];
      failedFieldIds: string[];
      // 스캐폴드 직후 상세(detail) 순서 기준 첫 현장 보고 id — 마법사 진입점.
      // 호출 측이 detailCache 를 직접 피킹하지 않도록 결과로 전달. loadDetail 실패
      // 또는 스캐폴드 0건이면 null (호출 측은 상세 화면으로 폴백).
      firstFieldReportId: string | null;
    }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

interface ReportState {
  // 목록 표시용 (list 응답)
  reports: Report[];
  // 목록 조회 상태 — empty 와 error 를 화면에서 갈라내기 위한 것 (강령 3).
  // detailStatus 가 상세에서 하는 역할을 목록에서 한다.
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  listError: string | null;
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
  // 부분 실패 시 attempted/failed 카운트 반환, 호출 측이 사용자 안내 (F4).
  createWithVisitScaffold: (
    body: CreateReportBody,
    visitFieldIds: string[],
  ) => Promise<CreateWithScaffoldResult>;
  update: (id: string, body: UpdateReportBody) => Promise<GenericResult>;
  // field_reports → Word 생성/재생성. 성공 시 outputFileUrl 갱신 (다운로드 버튼 노출).
  exportWord: (reportId: string, regenerate?: boolean) => Promise<GenericResult>;
  // backend-backlog §19 — PDF 는 서버에 영속되지 않아 loadDetail 로 회수할 수 없다.
  // 그래서 유일하게 결과 URL 자체를 반환하는 액션 — 호출 측이 즉시 열어야 한다.
  exportPdf: (
    reportId: string,
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  // 위치도(개요 지도) 캡처 이미지 업로드 (backend-backlog §20). 서버가 압축·저장하고
  // 재업로드 시 outputFileUrl 을 null 로 초기화 → 곧이은 exportWord 가 새 위치도로 재생성.
  // 응답 비의존 — loadDetail 로 overviewMapUrl/outputFileUrl 재동기화.
  uploadOverviewPhoto: (
    reportId: string,
    file: { uri: string; name: string; type: string },
  ) => Promise<GenericResult>;
  remove: (id: string) => Promise<GenericResult>;
  // 현장별 전·중·후 보고(field_reports) CRUD — 성공 시 상세 재로드로 fieldReports 갱신.
  // addFieldReport: 생성된 fieldReportId 반환 (즉시 사진 업로드 lazy-create 에 사용).
  addFieldReport: (
    reportId: string,
    body: FieldReportInput,
  ) => Promise<{ ok: true; fieldReportId: string } | { ok: false; error: string }>;
  updateFieldReport: (reportId: string, fieldReportId: string, body: Partial<FieldReportInput>) => Promise<GenericResult>;
  removeFieldReport: (reportId: string, fieldReportId: string) => Promise<GenericResult>;
  // 슬롯(전/중/후) 사진 multipart 직업로드(서버 압축) → loadDetail 로 슬롯 URL 재동기화.
  uploadFieldReportPhoto: (
    reportId: string,
    fieldReportId: string,
    params: { slot: 'before' | 'pending' | 'after'; file: { uri: string; name: string; type: string }; caption?: string },
  ) => Promise<GenericResult>;
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
    overviewMapUrl: item.overviewMapUrl ?? null,
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
    overviewMapUrl: d.overviewMapUrl ?? null,
    fieldReports: d.fieldReports,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  listStatus: 'idle',
  listError: null,
  detailCache: {},
  detailStatus: {},
  busy: false,

  hydrate: async () => {
    await get().refresh();
  },

  refresh: async (params) => {
    set({ listStatus: 'loading', listError: null });
    try {
      const res = await reportsApi.list(params);
      const userId = useAuthStore.getState().user?.id ?? '';
      const items = res.items.map((it) => listItemToReport(it, userId));
      set({ reports: items, listStatus: 'ready', listError: null });
    } catch (e) {
      // 삼키지 않는다 — 실패를 무시하면 reports 가 [] 로 남아 EmptyState 가 뜨고,
      // 사용자는 서버 오류를 '보고서 없음' 으로 오독한다 (강령 3).
      set({ listStatus: 'error', listError: localizeError(e) });
    }
  },

  loadDetail: async (reportId) => {
    // 이미 success 인 detailStatus 를 'loading' 으로 downgrade 하지 않음 (G7) —
    // createWithVisitScaffold 가 success 후 곧장 loadDetail 호출 시 잠깐 'loading' 으로 보이고
    // 캐시는 fieldReports 없는 상태라 빈 화면 flash 가 생기던 회로 차단.
    set((s) => ({
      detailStatus:
        s.detailStatus[reportId] === 'success'
          ? s.detailStatus
          : { ...s.detailStatus, [reportId]: 'loading' },
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
      // 이미 success 였으면 missing 으로 격하시키지 않음 — 캐시 사용 계속.
      set((s) => ({
        detailStatus:
          s.detailStatus[reportId] === 'success'
            ? s.detailStatus
            : { ...s.detailStatus, [reportId]: 'missing' },
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
    // busy 는 create + scaffold + loadDetail 끝까지 유지 (F10).
    set({ busy: true });

    // (1) from-trip 단축 우선 — 서버가 visits 별 FieldReport 를 일괄 스캐폴드 (round-trip 절감).
    // 미배포(404/405) 면 아래 레거시 경로로 폴백. 그 외 에러는 부분 생성 가능성이 있어 surface.
    if (body.tripId) {
      try {
        const res = await reportsApi.createFromTrip(body.tripId, { title: body.title });
        const detail = await get().loadDetail(res.reportId);
        set({ busy: false });
        const report: Report =
          detail ?? {
            id: res.reportId,
            creatorId: useAuthStore.getState().user?.id ?? '',
            tripId: body.tripId,
            title: body.title,
            outputFileUrl: null,
            fieldReports: res.fieldReports,
            createdAt: '',
            updatedAt: '',
          };
        return {
          ok: true,
          report,
          attemptedFieldIds: res.fieldReports.map((fr) => fr.fieldId),
          failedFieldIds: [],
          // detail 캐시가 채워졌을 때만 마법사 진입 — field-report.tsx 가 detailCache 의
          // fieldReports 에 의존하므로, loadDetail 실패 시 res 의 frId 로 진입하면 빈 캐시로
          // '현장 보고 없음' 막다른 화면이 된다. 레거시 경로와 동일하게 detail 기준만 사용.
          firstFieldReportId: detail?.fieldReports?.[0]?.id ?? null,
        };
      } catch (e) {
        const notDeployed =
          e instanceof ApiError && (e.status === 404 || e.status === 405);
        if (!notDeployed) {
          set({ busy: false });
          return { ok: false, error: describeError(e) };
        }
        // 404/405 → 미배포. 레거시 경로로 폴백 (busy 유지).
      }
    }

    // (2) 레거시: create + N×addFieldReport.
    let created: Report;
    try {
      // create 가 자체 busy=false flip 하지 않도록 직접 api 호출 + 캐시 반영.
      const data = await reportsApi.create(body);
      created = {
        id: data.id,
        creatorId: data.authorUserId,
        tripId: data.tripId,
        title: data.title,
        outputFileUrl: data.outputFileUrl,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
      set((s) => ({
        reports: [created, ...s.reports.filter((x) => x.id !== created.id)],
        detailCache: { ...s.detailCache, [created.id]: created },
        detailStatus: { ...s.detailStatus, [created.id]: 'success' },
      }));
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
    // unique fieldId 만, 빈 string 제외 (timeline.fieldId 누락 — backlog §16).
    const targets = Array.from(new Set(visitFieldIds.filter(Boolean)));
    // 병렬 호출 (G9) — distinct fieldId 라 서버 race 없음. wall-time N×latency → max(latency).
    // allSettled 는 절대 reject 안 함 — 한 건 실패해도 나머지 결과 그대로 반환.
    const results = await Promise.allSettled(
      targets.map((fieldId) =>
        reportsApi.addFieldReport(created.id, { fieldId }),
      ),
    );
    const failedFieldIds: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') failedFieldIds.push(targets[i]);
    });
    // loadDetail 실패는 보고서/카드 생성 자체엔 영향 X — 별도 catch 후 success 유지 (G6).
    // try 안에 두면 5xx 가 catch 로 떨어져 호출 측이 '생성 실패' 로 오인 → 중복 보고서 생성.
    let detail: Report | null = null;
    try {
      detail = await get().loadDetail(created.id);
    } catch {
      // 캐시는 이미 success — 사용자가 상세 진입하면 다시 fetch 시도 가능.
    }
    set({ busy: false });
    return {
      ok: true,
      report: created,
      attemptedFieldIds: targets,
      failedFieldIds,
      firstFieldReportId: detail?.fieldReports?.[0]?.id ?? null,
    };
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

  exportWord: async (reportId, regenerate = false) => {
    set({ busy: true });
    try {
      await reportsApi.exportWord(reportId, regenerate);
      // 응답 shape 에 의존하지 않고 권위 있는 상세 GET 으로 outputFileUrl 갱신 → 다운로드 버튼 노출.
      // (사진 0건이면 400 으로 throw → catch 에서 friendly 에러. 2026-06-19 운영 probe 확인)
      set({ busy: false });
      await get().loadDetail(reportId);
      return { ok: true };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  exportPdf: async (reportId) => {
    set({ busy: true });
    try {
      const res = await reportsApi.exportPdf(reportId);
      set({ busy: false });
      // downloadUrl 우선 — 백엔드가 둘 다 줄 때 downloadUrl 이 첨부 다운로드용.
      const url = (res?.downloadUrl ?? res?.url ?? '').trim();
      if (!url) {
        // 200 인데 URL 이 없으면 열 대상이 없다 — 조용히 성공 처리하면 아무 일도 안 일어난 것처럼 보인다.
        return { ok: false, error: 'PDF 주소를 받지 못했습니다. 잠시 후 다시 시도해주세요.' };
      }
      return { ok: true, url };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  uploadOverviewPhoto: async (reportId, file) => {
    try {
      await reportsApi.uploadOverviewPhoto(reportId, file);
      // 응답 본문 비의존 — 권위 있는 상세 GET 으로 overviewMapUrl(+재업로드 시 null 된
      // outputFileUrl) 갱신. 호출 측이 곧장 exportWord 하므로 다운로드 버튼은 그쪽이 재노출.
      await get().loadDetail(reportId);
      return { ok: true };
    } catch (e) {
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
      const created = await reportsApi.addFieldReport(reportId, body);
      await get().loadDetail(reportId);
      return { ok: true, fieldReportId: created.id };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  uploadFieldReportPhoto: async (reportId, fieldReportId, params) => {
    try {
      await reportsApi.uploadFieldReportPhoto(reportId, fieldReportId, params);
      // 응답 본문 비의존 — 권위 있는 상세 GET 으로 슬롯 URL 갱신.
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

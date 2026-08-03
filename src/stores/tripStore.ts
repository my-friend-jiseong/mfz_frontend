import { create } from 'zustand';
import type { Trip } from '@/types/entities';
import { trips as tripsApi, ApiError, localizeError } from '@/api';
import type { TripUpdateBody } from '@/api';
import { useAuthStore } from './authStore';
import { useVisitStore } from './visitStore';
import { useDestinationStore } from './destinationStore';

type StartResult =
  | { ok: true; trip: Trip }
  | { ok: false; error: string };

type EndResult =
  | { ok: true; trip: Trip }
  | { ok: false; needsConfirm: true; message: string }
  | { ok: false; error: string };

type GenericResult = { ok: true } | { ok: false; error: string };

// 외근 삭제 — 방문·보고서 연결 시 needsConfirm(=force 재확인). end 와 동일 패턴.
type RemoveResult =
  | { ok: true }
  | { ok: false; needsConfirm: true; message: string }
  | { ok: false; error: string };

interface TripState {
  trips: Trip[];
  activeTripId: string | null;
  busy: boolean;
  // tripId 별 detail fetch 진행 상태 (G10 altitude) — reportStore.detailStatus 와 동일 패턴.
  // 'loading' 동안엔 그 tripId 에 의존하는 submit/UI 가드 가능. token-ref race 회피용 단일 진실.
  detailStatus: Record<string, 'loading' | 'success' | 'missing'>;

  hydrate: () => Promise<void>;
  refreshActive: () => Promise<void>;
  refreshList: () => Promise<void>;
  // trips.detail 페치 + visitStore 로 timeline sync. trips/[id] / review 진입 시 호출.
  loadDetail: (id: string) => Promise<void>;
  start: (title?: string, plannedFieldIds?: string[]) => Promise<StartResult>;
  end: (force?: boolean) => Promise<EndResult>;
  update: (id: string, body: TripUpdateBody) => Promise<GenericResult>;
  remove: (id: string, force?: boolean) => Promise<RemoveResult>;

  getById: (id: string) => Trip | undefined;
  byWorker: (workerId: string) => Trip[];
  clearAll: () => void;
}

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? '';
}

const describeError = localizeError;

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  activeTripId: null,
  busy: false,
  detailStatus: {},

  hydrate: async () => {
    await Promise.all([get().refreshActive(), get().refreshList()]);
  },

  refreshActive: async () => {
    try {
      // ERD v2: official-notice 제거 — 활성 외근 id 만.
      const res = await tripsApi.active();
      set({ activeTripId: res.isActive ? res.tripId : null });
    } catch {
      // 비로그인 상태에서 호출되는 경우 등 — 무시
    }
  },

  refreshList: async () => {
    try {
      const res = await tripsApi.list({ limit: 50 });
      const userId = currentUserId();
      // GET /api/trips 는 본인 외근만 반환 (단일 Actor). 응답에 workerId 없어 현재 user 로 채움.
      const items: Trip[] = res.items.map((t) => ({
        id: t.tripId,
        workerId: userId,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        status: t.endedAt ? 'ended' : 'active',
        title: t.title,
        siteCount: t.siteCount,
        // §26 — 계획 목적지 수. 구 백엔드는 이 키가 없어 undefined 로 남고, 그때 카드가
        // 진행률 대신 "방문 N건" 으로 폴백한다(TripCard 가드).
        destinationCount: t.destinationCount,
        visitCount: t.visitCount,
      }));
      set({ trips: items });
    } catch {
      // ignore
    }
  },

  loadDetail: async (id) => {
    set((s) => ({ detailStatus: { ...s.detailStatus, [id]: 'loading' } }));
    try {
      const res = await tripsApi.detail(id);
      // timeline → visitStore. tripDetailResponse.timeline 의 entry 는 fieldId 가 없을 수도 있어
      // visitStore 가 빈 string 으로 흡수 — UI 쪽 field lookup 에서 graceful fallback.
      if (res.timeline && res.timeline.length > 0) {
        useVisitStore.getState().syncFromTimeline(id, res.timeline);
      }
      // backend-backlog §11 — 상세 응답의 계획 목적지를 destinationStore 로 하이드레이트
      // (다른 기기·세션·캐시정리 후에도 '계획 N곳'·지도 마커 노출). legacy 백엔드는 미포함.
      if (res.destinations) {
        useDestinationStore.getState().setFromServer(id, res.destinations);
      }
      // 자체 trips 항목의 메타 갱신 — visitCount 가 list 응답보다 최신일 수 있음.
      set((s) => ({
        trips: s.trips.map((t) =>
          t.id === id
            ? {
                ...t,
                visitCount: res.visitCount ?? t.visitCount,
                endedAt: res.endedAt ?? t.endedAt,
                status: (res.status as Trip['status']) ?? t.status,
                title: res.title ?? t.title,
              }
            : t,
        ),
        detailStatus: { ...s.detailStatus, [id]: 'success' },
      }));
    } catch {
      // 비로그인·404 등 — 무시. 화면은 list 응답 기준으로 fallback 렌더.
      set((s) => ({ detailStatus: { ...s.detailStatus, [id]: 'missing' } }));
    }
  },

  start: async (title, plannedFieldIds) => {
    set({ busy: true });
    try {
      const trimmed = title?.trim();
      // backend-backlog §11 — 계획 목적지를 함께 전송해 서버에 영속.
      const plannedFields = plannedFieldIds?.length
        ? plannedFieldIds.map((fieldId, order) => ({ fieldId, order }))
        : undefined;
      const body =
        trimmed || plannedFields
          ? { ...(trimmed ? { title: trimmed } : {}), ...(plannedFields ? { plannedFields } : {}) }
          : undefined;
      const res = await tripsApi.start(body);
      const trip: Trip = {
        id: res.tripId,
        workerId: currentUserId(),
        startedAt: res.startedAt,
        endedAt: null,
        status: 'active',
        // 백엔드가 echo 하지 않아도 사용자가 입력한 제목을 로컬에 보존.
        title: res.title ?? trimmed,
      };
      set((s) => ({
        trips: [trip, ...s.trips.filter((t) => t.id !== trip.id)],
        activeTripId: trip.id,
        busy: false,
      }));
      // destinations 하이드레이트: 서버 응답 우선, 없으면(레거시) 로컬 폴백.
      if (plannedFieldIds?.length) {
        if (res.destinations) {
          useDestinationStore.getState().setFromServer(trip.id, res.destinations);
        } else {
          useDestinationStore.getState().bulkCreate(trip.id, plannedFieldIds);
        }
      }
      return { ok: true, trip };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  end: async (force = false) => {
    set({ busy: true });
    try {
      const res = await tripsApi.end(force);
      let endedTrip: Trip | null = null;
      set((s) => ({
        trips: s.trips.map((t) => {
          if (t.id === res.tripId) {
            endedTrip = { ...t, endedAt: res.endedAt, status: 'ended' };
            return endedTrip;
          }
          return t;
        }),
        activeTripId: null,
        busy: false,
      }));
      if (!endedTrip) {
        await get().refreshList();
      }
      return {
        ok: true,
        trip:
          endedTrip ??
          {
            id: res.tripId,
            workerId: currentUserId(),
            startedAt: res.endedAt,
            endedAt: res.endedAt,
            status: 'ended',
          },
      };
    } catch (e) {
      set({ busy: false });
      if (e instanceof ApiError && e.code === 'confirm_required_zero_visits') {
        return { ok: false, needsConfirm: true, message: e.message };
      }
      return { ok: false, error: describeError(e) };
    }
  },

  update: async (id, body) => {
    try {
      await tripsApi.update(id, body);
      // 응답 본문에 의존하지 않고 보낸 값으로 로컬 패치 — 상세응답 status 가
      // normal|abnormal 이라 Trip.status 로 쓰면 어긋나기 때문(2026-06-19 운영 probe 확인).
      set((s) => ({
        trips: s.trips.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(body.title !== undefined ? { title: body.title } : {}),
                ...(body.startedAt !== undefined ? { startedAt: body.startedAt } : {}),
                // endedAt 보정 시 종료 처리로 간주.
                ...(body.endedAt !== undefined
                  ? { endedAt: body.endedAt, status: 'ended' as const }
                  : {}),
              }
            : t,
        ),
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  remove: async (id, force = false) => {
    // 진행 중 외근은 종료 후 삭제 — UI 가드와 별개로 store 차원에서도 거부.
    if (get().activeTripId === id) {
      return { ok: false, error: '진행 중인 외근은 종료 후 삭제할 수 있습니다.' };
    }
    try {
      await tripsApi.remove(id, force);
      set((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
      // 그 외근에 묶인 visit·destination 둘 다 로컬 정리.
      // optional chain 제거 — 인터페이스가 required 라 ?. 는 dead code 였고,
      // 미래에 메서드가 사라지면 silently 빠지는 footgun 이었음.
      useVisitStore.getState().removeByTrip(id);
      useDestinationStore.getState().removeByTrip(id);
      return { ok: true };
    } catch (e) {
      // 방문·보고서 연결(409) → 강제 삭제 재확인 유도 (백엔드 ?force=true 지원).
      if (e instanceof ApiError && e.code === 'has_related_trip_records' && !force) {
        return { ok: false, needsConfirm: true, message: e.message };
      }
      return { ok: false, error: describeError(e) };
    }
  },

  getById: (id) => get().trips.find((t) => t.id === id),

  byWorker: (workerId) =>
    get()
      .trips.filter((t) => t.workerId === workerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),

  // 로그아웃 시 호출.
  clearAll: () => set({ trips: [], activeTripId: null, busy: false, detailStatus: {} }),
}));

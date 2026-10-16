import { create } from 'zustand';
import { useTripPrepStore } from './tripPrepStore';
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
  // 목록 조회 상태 — empty 와 error 를 화면에서 갈라내기 위한 것 (강령 3).
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  listError: string | null;
  activeTripId: string | null;
  // 첫 /api/trips/active 응답(성공·실패)을 받았는지. 외근 탭 첫 화면이 진행 중 여부를 모른 채
  // 목록부터 그렸다가 외근 진행으로 바뀌는 깜빡임을 막는다.
  activeResolved: boolean;
  // 진행 중 외근을 서버에서 실제로 확인했는지(/active 성공·start·end 응답). activeResolved 는 실패해도 true 가 되므로
  // '진행 중 외근 없음'을 믿어야 하는 곳(체크인 저장 대기열)은 이걸 본다.
  activeKnown: boolean;
  // 방금 끝낸 외근 id — 종료 직후 이동이 끝날 때까지 외근 탭 첫 화면이 외근 진행 화면을 계속 그리게 한다.
  // activeTripId 가 비는 배치에서 첫 화면이 목록으로 바뀌면서 동시에 화면 이동이 일어나면 Fabric 이
  // 무음 크래시한 전례가 있다(떠나는 화면 폼 플립 금지). 이동 뒤 clearEnding 으로 비운다.
  endingTripId: string | null;
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

  clearEnding: () => void;
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
  listStatus: 'idle',
  listError: null,
  activeTripId: null,
  activeResolved: false,
  activeKnown: false,
  endingTripId: null,
  busy: false,
  detailStatus: {},

  hydrate: async () => {
    await Promise.all([get().refreshActive(), get().refreshList()]);
  },

  refreshActive: async () => {
    try {
      // ERD v2: official-notice 제거 — 활성 외근 id 만.
      const res = await tripsApi.active();
      set({ activeTripId: res.isActive ? res.tripId : null, activeResolved: true, activeKnown: true });
    } catch {
      // 비로그인 상태에서 호출되는 경우 등 — 무시. 모르는 채로 막아 두지 않고 목록을 보여 준다.
      set({ activeResolved: true });
    }
  },

  refreshList: async () => {
    set({ listStatus: 'loading', listError: null });
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
      set({ trips: items, listStatus: 'ready', listError: null });
    } catch (e) {
      // 삼키지 않는다 — 실패를 무시하면 trips 가 [] 로 남아 EmptyState 가 뜨고,
      // 사용자는 서버 오류를 '외근 없음' 으로 오독한다 (강령 3).
      set({ listStatus: 'error', listError: localizeError(e) });
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
        // 목록에 아직 없는 외근(3-7 방문 기록 수정을 바로 연 경우 등)은 상세 응답으로 넣어 둔다 — 안 그러면 화면이
        // '목록에 없음 → 상세 다시 요청'을 되풀이한다.
        trips: (s.trips.some((t) => t.id === id)
          ? s.trips
          : [
              ...s.trips,
              {
                id: res.tripId,
                workerId: res.userId,
                startedAt: res.startedAt,
                endedAt: res.endedAt,
                status: res.status as Trip['status'],
                title: res.title,
                visitCount: res.visitCount,
              } as Trip,
            ]
        ).map((t) =>
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
        activeKnown: true,
        busy: false,
      }));
      // 담아 둔 목적지는 이 외근으로 넘어갔다.
      useTripPrepStore.getState().clear();
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
        activeKnown: true,
        endingTripId: res.tripId,
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

  clearEnding: () => set({ endingTripId: null }),

  getById: (id) => get().trips.find((t) => t.id === id),

  byWorker: (workerId) =>
    get()
      .trips.filter((t) => t.workerId === workerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),

  // 로그아웃 시 호출.
  clearAll: () =>
    set({
      trips: [],
      listStatus: 'idle',
      listError: null,
      activeTripId: null,
      activeResolved: false,
      activeKnown: false,
      endingTripId: null,
      busy: false,
      detailStatus: {},
    }),
}));

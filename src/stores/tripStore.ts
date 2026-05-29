import { create } from 'zustand';
import type { Trip } from '@/types/entities';
import { trips as tripsApi, ApiError, localizeError } from '@/api';
import { useAuthStore } from './authStore';
import { useVisitStore } from './visitStore';

type StartResult =
  | { ok: true; trip: Trip }
  | { ok: false; error: string };

type EndResult =
  | { ok: true; trip: Trip }
  | { ok: false; needsConfirm: true; message: string }
  | { ok: false; error: string };

interface TripState {
  trips: Trip[];
  activeTripId: string | null;
  busy: boolean;

  hydrate: () => Promise<void>;
  refreshActive: () => Promise<void>;
  refreshList: () => Promise<void>;
  // trips.detail 페치 + visitStore 로 timeline sync. trips/[id] / review 진입 시 호출.
  loadDetail: (id: string) => Promise<void>;
  start: (title?: string) => Promise<StartResult>;
  end: (force?: boolean) => Promise<EndResult>;

  getById: (id: string) => Trip | undefined;
  byWorker: (workerId: string) => Trip[];
}

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? '';
}

const describeError = localizeError;

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  activeTripId: null,
  busy: false,

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
        visitCount: t.visitCount,
      }));
      set({ trips: items });
    } catch {
      // ignore
    }
  },

  loadDetail: async (id) => {
    try {
      const res = await tripsApi.detail(id);
      // timeline → visitStore. tripDetailResponse.timeline 의 entry 는 fieldId 가 없을 수도 있어
      // visitStore 가 빈 string 으로 흡수 — UI 쪽 field lookup 에서 graceful fallback.
      if (res.timeline && res.timeline.length > 0) {
        useVisitStore.getState().syncFromTimeline(id, res.timeline);
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
      }));
    } catch {
      // 비로그인·404 등 — 무시. 화면은 list 응답 기준으로 fallback 렌더.
    }
  },

  start: async (title) => {
    set({ busy: true });
    try {
      const trimmed = title?.trim();
      const res = await tripsApi.start(trimmed ? { title: trimmed } : undefined);
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

  getById: (id) => get().trips.find((t) => t.id === id),

  byWorker: (workerId) =>
    get()
      .trips.filter((t) => t.workerId === workerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
}));

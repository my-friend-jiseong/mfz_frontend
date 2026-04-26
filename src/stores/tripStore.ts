import { create } from 'zustand';
import type { Trip } from '@/types/entities';
import { trips as tripsApi, ApiError } from '@/api';
import { useAuthStore } from './authStore';

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
  // 호출 측에서 로딩 표시할 수 있도록 — 거친 단일 플래그 (충분)
  busy: boolean;

  hydrate: () => Promise<void>;
  refreshActive: () => Promise<void>;
  refreshList: () => Promise<void>;
  start: () => Promise<StartResult>;
  end: (force?: boolean) => Promise<EndResult>;

  getById: (id: string) => Trip | undefined;
  byWorker: (workerId: string) => Trip[];
}

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? '';
}

function describeError(e: unknown): string {
  if (e instanceof ApiError) return e.message || `오류 (HTTP ${e.status})`;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류';
}

export const useTripStore = create<TripState>((set, get) => ({
  // 시드 데이터 제거 — list 응답으로만 채움
  trips: [],
  activeTripId: null,
  busy: false,

  hydrate: async () => {
    await Promise.all([get().refreshActive(), get().refreshList()]);
  },

  refreshActive: async () => {
    try {
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
      const items: Trip[] = res.items.map((t) => ({
        id: t.tripId,
        workerId: userId,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
      }));
      set({ trips: items });
    } catch {
      // ignore
    }
  },

  start: async () => {
    set({ busy: true });
    try {
      const res = await tripsApi.start();
      const trip: Trip = {
        id: res.tripId,
        workerId: currentUserId(),
        startedAt: res.startedAt,
        endedAt: null,
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
      // 종료된 trip 을 trips 배열에서 갱신
      let endedTrip: Trip | null = null;
      set((s) => ({
        trips: s.trips.map((t) => {
          if (t.id === res.tripId) {
            endedTrip = { ...t, endedAt: res.endedAt };
            return endedTrip;
          }
          return t;
        }),
        activeTripId: null,
        busy: false,
      }));
      // 목록에 활성 외근이 누락된 경우 (예: 다른 기기에서 시작) 안전하게 재페치
      if (!endedTrip) {
        await get().refreshList();
      }
      return { ok: true, trip: endedTrip ?? { id: res.tripId, workerId: currentUserId(), startedAt: '', endedAt: res.endedAt } };
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

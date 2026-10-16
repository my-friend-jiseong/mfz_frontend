import { create } from 'zustand';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useVisitStore } from './visitStore';
import { useDestinationStore } from './destinationStore';
import { notice } from '@/components/ui/ConfirmDialog';

// 체크인 저장 대기열(7-2 오프라인 저장 · 7-3 저장 실패).
// 서버에 닿지 못한 체크인을 기기에 남겨 두고, 연결이 돌아오거나 앱이 앞으로 오면 다시 보낸다.
// 서버가 거부하면(4xx·5xx) '실패'로 두고 사용자가 [다시 시도]·칩을 눌러야 다시 보낸다.
//
// 지금 서버 계약(check-in body 에 tripId 없음)에서는 서버가 '지금 진행 중인 외근'에 방문을 붙인다. 그래서
// 대기열 항목은 그 외근이 아직 진행 중일 때만 보낸다 — 외근이 끝났거나 다른 외근이 진행 중이면 엉뚱한 외근에
// 붙으므로 보내지 않고 알린 뒤 버린다. 끝난 외근에 붙여 저장하는 것은 backlog '2차 H'(visitedAt·tripId).
// TODO(PR7): 체크인 화면이 사진·메모·조치 상태도 함께 대기열에 싣는다. 지금은 체크인(방문 생성)만.

const STORAGE_KEY = 'mfz.checkinQueue.v1';
// 대기 중인 것이 있으면 이 간격으로도 다시 보낸다(NetInfo 이벤트를 못 받는 환경 대비).
const RETRY_MS = 30_000;

export interface QueuedCheckIn {
  id: string;
  /** 대기열에 넣은 사용자 — 다른 계정으로 로그인하면 보내지 않고 지운다. */
  userId: string;
  tripId: string;
  fieldId: string;
  /** 경고 줄에 보일 현장 이름(7-3 '낙동대로 351 기록을 저장하지 못했어요.'). */
  label: string;
  /** 체크인한 시각 — 7-8 거리 기준(마지막 체크인 현장) 정렬에 쓰고, 서버가 받게 되면 함께 보낸다(backlog 2차 H). */
  visitedAt: string;
  state: 'pending' | 'failed';
  error?: string;
}

interface CheckinQueueState {
  items: QueuedCheckIn[];
  hydrated: boolean;
  /** 지금 보내는 중 */
  flushing: boolean;
  hydrate: () => Promise<void>;
  enqueue: (input: Pick<QueuedCheckIn, 'tripId' | 'fieldId' | 'label'>) => QueuedCheckIn | null;
  /** 대기 중인 것을 보낸다. retryFailed 면 실패한 것도 다시. */
  flush: (opts?: { retryFailed?: boolean }) => Promise<void>;
  /** 로그인한 사용자가 바뀌면 — 다른 사용자의 항목은 지운다. */
  onUserChange: (userId: string | null) => void;
  clearAll: () => Promise<void>;
}

// 대기열이 알아야 하는 앱 상태 — 스토어끼리 순환 import 를 피하려고 앱 루트가 넣어 준다(startCheckinQueue).
let getUserId: () => string | null = () => null;
// undefined = 아직 모름(부팅 직후 /trips/active 응답 전) — 그동안은 보내지도 버리지도 않는다.
let getActiveTripId: () => string | null | undefined = () => undefined;

let seq = 0;
let inflight: Promise<void> | null = null;

function persist(items: QueuedCheckIn[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
}

export const useCheckinQueueStore = create<CheckinQueueState>((set, get) => {
  const replace = (next: QueuedCheckIn[]) => {
    set({ items: next });
    persist(next);
  };

  const runOnce = async () => {
    const userId = getUserId();
    if (!userId || getActiveTripId() === undefined) return;
    const todo = get().items.filter((x) => x.state === 'pending' && x.userId === userId);
    if (todo.length === 0) return;
    set({ flushing: true });
    const dropped: QueuedCheckIn[] = [];
    try {
      for (const item of todo) {
        // 이 외근이 지금 진행 중이 아니면 서버가 다른 외근(또는 409)에 처리한다 — 보내지 않는다.
        if (getActiveTripId() !== item.tripId) {
          dropped.push(item);
          replace(get().items.filter((x) => x.id !== item.id));
          continue;
        }
        const r = await useVisitStore.getState().checkIn(item.tripId, item.fieldId);
        // 아직 끊김, 또는 세션 만료 — 나머지도 그대로 두고 다음 기회에.
        if (!r.ok && (r.network || r.status === 401)) break;
        if (r.ok) {
          replace(get().items.filter((x) => x.id !== item.id));
          // 보내는 사이 외근이 바뀌었으면 서버가 다른 외근에 붙였다 — 알린다.
          if (r.visit.tripId && r.visit.tripId !== item.tripId) dropped.push(item);
        } else {
          replace(get().items.map((x) => (x.id === item.id ? { ...x, state: 'failed' as const, error: r.error } : x)));
        }
      }
    } finally {
      set({ flushing: false });
    }
    if (dropped.length > 0) {
      const names = dropped.map((d) => d.label).join(', ');
      void notice('체크인을 저장하지 못했어요', `${names} 기록은 그 외근이 끝난 뒤라 저장하지 못했어요. 방문 기록을 다시 남겨 주세요.`);
    }
  };

  return {
    items: [],
    hydrated: false,
    flushing: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (Array.isArray(parsed)) {
          const saved = parsed.filter(
            (x): x is QueuedCheckIn =>
              !!x && typeof x === 'object' && typeof (x as QueuedCheckIn).fieldId === 'string' && typeof (x as QueuedCheckIn).userId === 'string',
          );
          const ids = new Set(saved.map((x) => x.id));
          set({ items: [...saved, ...get().items.filter((x) => !ids.has(x.id))] });
        }
      } catch {
        /* ignore */
      } finally {
        set({ hydrated: true });
      }
    },

    enqueue: ({ tripId, fieldId, label }) => {
      const userId = getUserId();
      if (!userId) return null;
      const item: QueuedCheckIn = {
        id: `q-${Date.now().toString(36)}-${++seq}`,
        userId,
        tripId,
        fieldId,
        label,
        visitedAt: new Date().toISOString(),
        state: 'pending',
      };
      // 같은 외근·현장은 하나만(서버도 (외근, 현장) 기준 멱등이다).
      replace([...get().items.filter((x) => !(x.tripId === tripId && x.fieldId === fieldId)), item]);
      // 목적지는 바로 '방문함'으로 보인다(7-2 진행 1/2) — 서버가 받으면 체크인이 도착 처리를 한다.
      const ds = useDestinationStore.getState();
      const dest = ds.findByTripField(tripId, fieldId);
      if (dest && dest.status === 'pending') ds.markArrived(dest.id);
      return item;
    },

    flush: (opts) => {
      // 실패 → 대기는 먼저(동기로) 바꾼다 — 보내는 중이면 그 회차가 끝난 뒤 한 번 더 돈다.
      if (opts?.retryFailed && get().items.some((x) => x.state === 'failed')) {
        replace(get().items.map((x) => (x.state === 'failed' ? { ...x, state: 'pending' as const, error: undefined } : x)));
        if (inflight) return inflight.then(() => get().flush());
      }
      if (inflight) return inflight;
      inflight = runOnce().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    onUserChange: (userId) => {
      if (!userId) return;
      const mine = get().items.filter((x) => x.userId === userId);
      if (mine.length !== get().items.length) replace(mine);
      void get().flush();
    },

    clearAll: async () => {
      set({ items: [] });
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  };
});

/** 지금 인터넷에 닿을 수 없다고 확실한가. 모르면 false(일단 보내 본다). */
export async function isKnownOffline(): Promise<boolean> {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected === false || s.isInternetReachable === false;
  } catch {
    return false;
  }
}

/**
 * 앱 루트에서 한 번. 연결이 돌아오거나 앱이 앞으로 오면, 그리고 대기 중이면 주기적으로 다시 보낸다.
 * 로그인 사용자·진행 중 외근은 루트가 넘긴다(스토어 순환 import 방지).
 */
export function startCheckinQueue(deps: {
  getUserId: () => string | null;
  getActiveTripId: () => string | null | undefined;
}): () => void {
  getUserId = deps.getUserId;
  getActiveTripId = deps.getActiveTripId;
  void useCheckinQueueStore
    .getState()
    .hydrate()
    .then(() => useCheckinQueueStore.getState().onUserChange(getUserId()));
  const flush = () => {
    if (getUserId()) void useCheckinQueueStore.getState().flush();
  };
  const unsubNet = NetInfo.addEventListener((s) => {
    if (s.isConnected !== false && s.isInternetReachable !== false) flush();
  });
  const appSub = AppState.addEventListener('change', (st) => {
    if (st === 'active') flush();
  });
  // 웹: NetInfo 는 navigator.connection 이 있으면 그 change 만 듣는데, 브라우저가 오프라인→온라인을 그쪽으로
  // 알리지 않는 경우가 있다(크롬 실측) — window 'online' 도 듣는다.
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  win?.addEventListener('online', flush);
  // 로그아웃 상태에서는 돌지 않는다.
  const timer = setInterval(() => {
    const uid = getUserId();
    if (uid && useCheckinQueueStore.getState().items.some((x) => x.state === 'pending' && x.userId === uid)) flush();
  }, RETRY_MS);
  return () => {
    unsubNet();
    appSub.remove();
    win?.removeEventListener('online', flush);
    clearInterval(timer);
  };
}

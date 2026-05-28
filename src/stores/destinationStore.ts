import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Destination } from '@/types/entities';

// ERD v2: trip_planned_stops 테이블이 제거되어 목적지는 백엔드에 영속화되지 않는다.
// 프론트가 AsyncStorage 에 로컬 영속화 — 외근 진행 보조용(순수 클라이언트). 멀티 디바이스
// 동기화는 되지 않으며, 페이지 새로고침·앱 재기동 시 활성 외근의 목적지가 살아남도록 한다.
//
// zustand persist 미들웨어는 일부 환경에서 모듈 초기화 단계 충돌이 보고된 적 있어
// 단순 manual persist 패턴으로 통일.

const STORAGE_KEY = 'mfz.destinations.v1';

interface DestinationState {
  destinations: Destination[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  bulkCreate: (tripId: string, fieldIds: string[]) => Destination[];
  byTrip: (tripId: string) => Destination[];
  current: (tripId: string) => Destination | undefined;
  findByTripField: (
    tripId: string,
    fieldId: string,
  ) => Destination | undefined;
  markArrived: (id: string) => void;
  markSkipped: (id: string) => void;
  reorder: (tripId: string, orderedIds: string[]) => void;
  removeByTrip: (tripId: string) => void;
  isAllResolved: (tripId: string) => boolean;
  // 로그아웃 시 호출 — 다른 사용자가 같은 디바이스에서 로그인했을 때 잔존하지 않도록.
  clearAll: () => Promise<void>;
}

let nextSeq = 1;
function nextDestId(): string {
  return `dest-${Date.now().toString(36)}-${nextSeq++}`;
}

async function persist(destinations: Destination[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(destinations));
  } catch {
    // 저장 실패해도 앱 동작은 계속 — 다음 부팅 시 메모리 상태로만 유지됨.
  }
}

export const useDestinationStore = create<DestinationState>((set, get) => ({
  destinations: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Destination[];
        if (Array.isArray(parsed)) {
          set({ destinations: parsed });
        }
      }
    } catch {
      /* ignore */
    } finally {
      set({ hydrated: true });
    }
  },

  bulkCreate: (tripId, fieldIds) => {
    const created: Destination[] = fieldIds.map((fieldId, idx) => ({
      id: nextDestId(),
      tripId,
      fieldId,
      order: idx + 1,
      status: 'pending',
    }));
    const next = [...get().destinations, ...created];
    set({ destinations: next });
    void persist(next);
    return created;
  },

  byTrip: (tripId) =>
    get()
      .destinations.filter((d) => d.tripId === tripId)
      .sort((a, b) => a.order - b.order),

  current: (tripId) =>
    get()
      .destinations.filter((d) => d.tripId === tripId && d.status === 'pending')
      .sort((a, b) => a.order - b.order)[0],

  findByTripField: (tripId, fieldId) =>
    get().destinations.find(
      (d) => d.tripId === tripId && d.fieldId === fieldId,
    ),

  markArrived: (id) => {
    const next = get().destinations.map((d) =>
      d.id === id ? { ...d, status: 'arrived' as const } : d,
    );
    set({ destinations: next });
    void persist(next);
  },

  markSkipped: (id) => {
    const next = get().destinations.map((d) =>
      d.id === id ? { ...d, status: 'skipped' as const } : d,
    );
    set({ destinations: next });
    void persist(next);
  },

  reorder: (tripId, orderedIds) => {
    const next = get().destinations.map((d) => {
      if (d.tripId !== tripId) return d;
      const idx = orderedIds.indexOf(d.id);
      return idx >= 0 ? { ...d, order: idx + 1 } : d;
    });
    set({ destinations: next });
    void persist(next);
  },

  removeByTrip: (tripId) => {
    const next = get().destinations.filter((d) => d.tripId !== tripId);
    set({ destinations: next });
    void persist(next);
  },

  isAllResolved: (tripId) => {
    const list = get().destinations.filter((d) => d.tripId === tripId);
    if (list.length === 0) return false;
    return list.every((d) => d.status !== 'pending');
  },

  clearAll: async () => {
    set({ destinations: [] });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
}));

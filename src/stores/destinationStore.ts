import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Destination } from '@/types/entities';

interface DestinationState {
  destinations: Destination[];

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
  clearAll: () => void;
}

let nextSeq = 1;
function nextDestId(): string {
  return `dest-${Date.now().toString(36)}-${nextSeq++}`;
}

// 백엔드가 destinations 를 영속화하지 않는 동안(handoff §9a) 프론트가 AsyncStorage 에
// 로컬 영속화. 페이지 새로고침·앱 재기동 시 활성 외근의 목적지가 살아남아야 사용자가
// "방금 3곳 선택했는데 0곳" 같은 상태를 보지 않는다.
export const useDestinationStore = create<DestinationState>()(
  persist(
    (set, get) => ({
      destinations: [],

      bulkCreate: (tripId, fieldIds) => {
        const created: Destination[] = fieldIds.map((fieldId, idx) => ({
          id: nextDestId(),
          tripId,
          fieldId,
          order: idx + 1,
          status: 'pending',
        }));
        set((state) => ({ destinations: [...state.destinations, ...created] }));
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

      markArrived: (id) =>
        set((state) => ({
          destinations: state.destinations.map((d) =>
            d.id === id ? { ...d, status: 'arrived' } : d,
          ),
        })),

      markSkipped: (id) =>
        set((state) => ({
          destinations: state.destinations.map((d) =>
            d.id === id ? { ...d, status: 'skipped' } : d,
          ),
        })),

      reorder: (tripId, orderedIds) =>
        set((state) => ({
          destinations: state.destinations.map((d) => {
            if (d.tripId !== tripId) return d;
            const idx = orderedIds.indexOf(d.id);
            return idx >= 0 ? { ...d, order: idx + 1 } : d;
          }),
        })),

      removeByTrip: (tripId) =>
        set((state) => ({
          destinations: state.destinations.filter((d) => d.tripId !== tripId),
        })),

      isAllResolved: (tripId) => {
        const list = get().destinations.filter((d) => d.tripId === tripId);
        if (list.length === 0) return false;
        return list.every((d) => d.status !== 'pending');
      },

      clearAll: () => set({ destinations: [] }),
    }),
    {
      name: 'mfz.destinations.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ destinations: state.destinations }),
    },
  ),
);

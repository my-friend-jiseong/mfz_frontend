import { create } from 'zustand';
import type { Trip } from '@/types/entities';
import { mockTrips } from '@/data/mockSeed';

interface TripState {
  trips: Trip[];
  activeTripId: number | null;
  start: (workerId: number) => Trip | null;
  end: () => Trip | null;
  getById: (id: number) => Trip | undefined;
  byWorker: (workerId: number) => Trip[];
}

let nextId = 200;

export const useTripStore = create<TripState>((set, get) => ({
  trips: [...mockTrips],
  activeTripId: null,

  start: (workerId) => {
    // 동시 1건 제한 (공공 복무 관행)
    if (get().activeTripId !== null) return null;
    const newTrip: Trip = {
      id: ++nextId,
      workerId,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    set((state) => ({
      trips: [...state.trips, newTrip],
      activeTripId: newTrip.id,
    }));
    return newTrip;
  },

  end: () => {
    const active = get().activeTripId;
    if (active === null) return null;
    const endedAt = new Date().toISOString();
    let ended: Trip | null = null;
    set((state) => ({
      trips: state.trips.map((t) => {
        if (t.id === active) {
          ended = { ...t, endedAt };
          return ended;
        }
        return t;
      }),
      activeTripId: null,
    }));
    return ended;
  },

  getById: (id) => get().trips.find((t) => t.id === id),

  byWorker: (workerId) =>
    get()
      .trips.filter((t) => t.workerId === workerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
}));

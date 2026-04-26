import { create } from 'zustand';
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
}

let nextSeq = 1;
function nextDestId(): string {
  return `dest-${Date.now().toString(36)}-${nextSeq++}`;
}

export const useDestinationStore = create<DestinationState>((set, get) => ({
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
}));

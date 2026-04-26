import { create } from 'zustand';
import type { Visit, VisitStatus, TextMemo, Photo, VoiceMemo } from '@/types/entities';
import { mockVisits, mockTextMemos, mockPhotos, mockVoiceMemos } from '@/data/mockSeed';
import { useFieldStore } from './fieldStore';

interface VisitState {
  visits: Visit[];
  textMemos: TextMemo[];
  voiceMemos: VoiceMemo[];
  photos: Photo[];

  checkIn: (tripId: string, fieldId: string) => Visit | null;
  setResult: (visitId: string, status: VisitStatus) => void;
  addTextMemo: (visitId: string, content: string) => TextMemo | null;
  addPhoto: (visitId: string, fileUrl: string) => Photo | null;

  byTrip: (tripId: string) => Visit[];
  byField: (fieldId: string) => Visit[];
  getById: (id: string) => Visit | undefined;
  memosByVisit: (visitId: string) => TextMemo[];
  photosByVisit: (visitId: string) => Photo[];
}

let nextVisitSeq = 2000;
let nextMemoSeq = 3000;
let nextPhotoSeq = 4000;

export const useVisitStore = create<VisitState>((set, get) => ({
  visits: [...mockVisits],
  textMemos: [...mockTextMemos],
  voiceMemos: [...mockVoiceMemos],
  photos: [...mockPhotos],

  checkIn: (tripId, fieldId) => {
    const field = useFieldStore.getState().getById(fieldId);
    if (!field) return null;
    const newVisit: Visit = {
      id: `visit-local-${++nextVisitSeq}`,
      status: '재방문필요', // 초기값: 아직 결과 미지정
      tripId,
      fieldId,
      visitedAt: new Date().toISOString(),
    };
    set((state) => ({ visits: [...state.visits, newVisit] }));
    return newVisit;
  },

  setResult: (visitId, status) =>
    set((state) => ({
      visits: state.visits.map((v) =>
        v.id === visitId ? { ...v, status } : v,
      ),
    })),

  addTextMemo: (visitId, content) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return null;
    const field = useFieldStore.getState().getById(visit.fieldId);
    if (!field) return null;
    const memo: TextMemo = {
      id: `memo-local-${++nextMemoSeq}`,
      visitId,
      fieldId: visit.fieldId,
      content,
      latitude: field.latitude,
      longitude: field.longitude,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ textMemos: [...state.textMemos, memo] }));
    return memo;
  },

  addPhoto: (visitId, fileUrl) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return null;
    const field = useFieldStore.getState().getById(visit.fieldId);
    if (!field) return null;
    const photo: Photo = {
      id: `photo-local-${++nextPhotoSeq}`,
      visitId,
      fieldId: visit.fieldId,
      fileUrl,
      latitude: field.latitude,
      longitude: field.longitude,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ photos: [...state.photos, photo] }));
    return photo;
  },

  byTrip: (tripId) =>
    get()
      .visits.filter((v) => v.tripId === tripId)
      .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt)),

  byField: (fieldId) =>
    get()
      .visits.filter((v) => v.fieldId === fieldId)
      .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),

  getById: (id) => get().visits.find((v) => v.id === id),

  memosByVisit: (visitId) =>
    get().textMemos.filter((m) => m.visitId === visitId),

  photosByVisit: (visitId) => get().photos.filter((p) => p.visitId === visitId),
}));

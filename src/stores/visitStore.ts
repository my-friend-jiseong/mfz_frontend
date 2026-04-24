import { create } from 'zustand';
import type { Visit, VisitStatus, TextMemo, Photo, VoiceMemo } from '@/types/entities';
import { mockVisits, mockTextMemos, mockPhotos, mockVoiceMemos } from '@/data/mockSeed';
import { useFieldStore } from './fieldStore';

interface VisitState {
  visits: Visit[];
  textMemos: TextMemo[];
  voiceMemos: VoiceMemo[];
  photos: Photo[];

  checkIn: (tripId: number, fieldId: number) => Visit | null;
  setResult: (visitId: number, status: VisitStatus) => void;
  addTextMemo: (visitId: number, content: string) => TextMemo | null;
  addPhoto: (visitId: number, fileUrl: string) => Photo | null;

  byTrip: (tripId: number) => Visit[];
  byField: (fieldId: number) => Visit[];
  getById: (id: number) => Visit | undefined;
  memosByVisit: (visitId: number) => TextMemo[];
  photosByVisit: (visitId: number) => Photo[];
}

let nextVisitId = 2000;
let nextMemoId = 3000;
let nextPhotoId = 4000;

export const useVisitStore = create<VisitState>((set, get) => ({
  visits: [...mockVisits],
  textMemos: [...mockTextMemos],
  voiceMemos: [...mockVoiceMemos],
  photos: [...mockPhotos],

  checkIn: (tripId, fieldId) => {
    const field = useFieldStore.getState().getById(fieldId);
    if (!field) return null;
    const newVisit: Visit = {
      id: ++nextVisitId,
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
      id: ++nextMemoId,
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
      id: ++nextPhotoId,
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

import { create } from 'zustand';
import type { Visit, VisitStatus, TextMemo, Photo, VoiceMemo } from '@/types/entities';
import { visits as visitsApi, localizeError } from '@/api';
import { useFieldStore } from './fieldStore';

// 백엔드 실측 (smoke test):
//   - 메모 body 필드명: { text } 확정
//   - status 정답: 한글 enum (완료/부재/수취거절/주소불명/재방문필요/기타) — VisitStatus 그대로
//   - check-in 직후 초기 status: "완료" (백엔드가 자동 설정, 프런트 명세상 "재방문필요" 와 다름)
//   - memo 응답: { visitId, attachment: { id, type, text, createdAt, latitude, longitude, locationConsent } }
//   - status 응답: { visitId, status, reason, statusLogs[] }

type CheckInResult =
  | { ok: true; visit: Visit }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string };

interface VisitState {
  visits: Visit[];
  textMemos: TextMemo[];
  voiceMemos: VoiceMemo[];
  photos: Photo[];

  checkIn: (tripId: string, fieldId: string) => Promise<CheckInResult>;
  setResult: (visitId: string, status: VisitStatus, reason?: string) => Promise<GenericResult>;
  addTextMemo: (visitId: string, content: string) => Promise<GenericResult>;
  addPhoto: (
    visitId: string,
    file: { uri: string; name: string; type: string },
  ) => Promise<GenericResult>;

  byTrip: (tripId: string) => Visit[];
  byField: (fieldId: string) => Visit[];
  getById: (id: string) => Visit | undefined;
  memosByVisit: (visitId: string) => TextMemo[];
  photosByVisit: (visitId: string) => Photo[];
}

const describeError = localizeError;

export const useVisitStore = create<VisitState>((set, get) => ({
  visits: [],
  textMemos: [],
  voiceMemos: [],
  photos: [],

  checkIn: async (tripId, fieldId) => {
    const field = useFieldStore.getState().getById(fieldId);
    try {
      const res = await visitsApi.checkIn({
        fieldId,
        location: field
          ? { lat: field.latitude, lng: field.longitude }
          : undefined,
      });
      const v: Visit = {
        id: res.visitId,
        status: '완료', // 백엔드 초기값
        tripId: res.tripId,
        fieldId: res.fieldId,
        visitedAt: res.visitedAt,
      };
      set((s) => ({ visits: [...s.visits, v] }));
      return { ok: true, visit: v };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  setResult: async (visitId, status, reason) => {
    try {
      await visitsApi.setStatus(visitId, status, reason);
      set((s) => ({
        visits: s.visits.map((v) =>
          v.id === visitId ? { ...v, status } : v,
        ),
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  addTextMemo: async (visitId, content) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return { ok: false, error: '방문 정보를 찾을 수 없습니다' };
    try {
      const res = (await visitsApi.addTextMemo(visitId, content)) as {
        attachment?: {
          id: string;
          text: string;
          createdAt: string;
          latitude: number | null;
          longitude: number | null;
        };
      };
      const att = res?.attachment;
      if (!att) return { ok: true };
      const memo: TextMemo = {
        id: att.id,
        visitId,
        fieldId: visit.fieldId,
        content: att.text,
        latitude: att.latitude ?? 0,
        longitude: att.longitude ?? 0,
        createdAt: att.createdAt,
      };
      set((s) => ({ textMemos: [...s.textMemos, memo] }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  },

  addPhoto: async (visitId, file) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return { ok: false, error: '방문 정보를 찾을 수 없습니다' };
    try {
      const res = (await visitsApi.addPhoto(visitId, file)) as {
        attachment?: {
          id: string;
          fileUrl?: string;
          url?: string;
          createdAt: string;
          latitude: number | null;
          longitude: number | null;
        };
      };
      const att = res?.attachment;
      if (!att) return { ok: true };
      const photo: Photo = {
        id: att.id,
        visitId,
        fieldId: visit.fieldId,
        fileUrl: att.fileUrl ?? att.url ?? file.uri,
        latitude: att.latitude ?? 0,
        longitude: att.longitude ?? 0,
        createdAt: att.createdAt,
      };
      set((s) => ({ photos: [...s.photos, photo] }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
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

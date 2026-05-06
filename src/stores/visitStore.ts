import { create } from 'zustand';
import type { Visit, VisitStatus, TextMemo, Photo, VoiceMemo } from '@/types/entities';
import { visits as visitsApi, localizeError, NetworkError } from '@/api';
import { useFieldStore } from './fieldStore';
import { useOfflineQueueStore } from './offlineQueueStore';

// 백엔드 contract (handoff §5):
//   - 메모 body 필드명: { text } 확정
//   - status enum: 'completed' / 'absent' / 'refused' / 'unknown_address' /
//     'revisit_needed' / 'other'. 사용자 표시용 한국어는 VISIT_STATUS_LABEL 매핑.
//   - check-in 직후 초기 status: 'completed' — 백엔드가 자동 설정.
//   - resultStatus (별도 필드): 'normal' | 'abnormal' (status='completed' 면 자동 'normal').
//   - memo 응답: { visitId, attachment: { id, type, text, createdAt, latitude, longitude, locationConsent } }
//   - status 응답: { visitId, resultStatus, status, statusReason, statusLogs[] }
//   - "other" 선택 시 statusReason 10자 이상 필수 (백엔드 visit_status_reason_required).

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
  addVoiceMemo: (
    visitId: string,
    file: { uri: string; name: string; type: string },
    durationSeconds?: number,
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
        status: 'completed', // 백엔드 초기값 (체크인 직후)
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
      // 네트워크 끊김이면 큐잉 + optimistic UI (복구 시 자동 flush).
      if (e instanceof NetworkError) {
        await useOfflineQueueStore.getState().enqueue({
          kind: 'visitStatus',
          path: `/api/visits/${visitId}/status`,
          body: { status, ...(reason ? { statusReason: reason } : {}) },
        });
        set((s) => ({
          visits: s.visits.map((v) =>
            v.id === visitId ? { ...v, status } : v,
          ),
        }));
        return { ok: true };
      }
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
      // 네트워크 끊김이면 큐잉 + optimistic 메모 (서버 동기화 후 attachment id 는
      // 다음 방문 상세 새로고침 시 갱신됨).
      if (e instanceof NetworkError) {
        await useOfflineQueueStore.getState().enqueue({
          kind: 'visitTextMemo',
          path: `/api/visits/${visitId}/memos/text`,
          body: { text: content },
        });
        const optimistic: TextMemo = {
          id: `pending-${Date.now()}`,
          visitId,
          fieldId: visit.fieldId,
          content,
          latitude: 0,
          longitude: 0,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ textMemos: [...s.textMemos, optimistic] }));
        return { ok: true };
      }
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

  addVoiceMemo: async (visitId, file, durationSeconds) => {
    const visit = get().visits.find((v) => v.id === visitId);
    if (!visit) return { ok: false, error: '방문 정보를 찾을 수 없습니다' };
    try {
      const res = (await visitsApi.addVoiceMemo(visitId, file, durationSeconds)) as {
        attachment?: {
          id: string;
          fileUrl?: string;
          url?: string;
          durationSec?: number;
          createdAt: string;
          latitude: number | null;
          longitude: number | null;
        };
      };
      const att = res?.attachment;
      if (!att) return { ok: true };
      const memo: VoiceMemo = {
        id: att.id,
        visitId,
        fieldId: visit.fieldId,
        content: att.fileUrl ?? att.url ?? file.uri,
        latitude: att.latitude ?? 0,
        longitude: att.longitude ?? 0,
        createdAt: att.createdAt,
      };
      set((s) => ({ voiceMemos: [...s.voiceMemos, memo] }));
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

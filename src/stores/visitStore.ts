import { create } from 'zustand';
import type { Visit, VisitStatus } from '@/types/entities';
import { visits as visitsApi, localizeError } from '@/api';

// ERD v2: visits 는 체크인 기록(trip·field·시각·status)만. 메모·사진·음성 첨부 제거됨
// (memos/field_photos 는 현장 전용 — fieldStore.directAttachments 참조).
//   - check-in: fieldId 만 (siteName·location 제거).
//   - check-in 직후 초기 status: 'completed' (백엔드 자동 설정).
//   - setResult: 단일 status (result_status·status_reason 컬럼 제거).

type CheckInResult =
  | { ok: true; visit: Visit }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string };

interface VisitState {
  visits: Visit[];

  checkIn: (tripId: string, fieldId: string) => Promise<CheckInResult>;
  setResult: (visitId: string, status: VisitStatus) => Promise<GenericResult>;

  byTrip: (tripId: string) => Visit[];
  byField: (fieldId: string) => Visit[];
  getById: (id: string) => Visit | undefined;
}

const describeError = localizeError;

export const useVisitStore = create<VisitState>((set, get) => ({
  visits: [],

  checkIn: async (_tripId, fieldId) => {
    try {
      const res = await visitsApi.checkIn({ fieldId });
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

  setResult: async (visitId, status) => {
    try {
      await visitsApi.setStatus(visitId, status);
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

  byTrip: (tripId) =>
    get()
      .visits.filter((v) => v.tripId === tripId)
      .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt)),

  byField: (fieldId) =>
    get()
      .visits.filter((v) => v.fieldId === fieldId)
      .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),

  getById: (id) => get().visits.find((v) => v.id === id),
}));

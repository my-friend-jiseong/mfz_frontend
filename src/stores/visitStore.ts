import { create } from 'zustand';
import type { Visit, VisitStatus } from '@/types/entities';
import { normalizeVisitStatus } from '@/types/entities';
import { visits as visitsApi, localizeError } from '@/api';

// ERD v2: visits 는 체크인 기록(trip·field·시각·status)만. 메모·사진·음성 첨부 제거됨
// (memos/field_photos 는 현장 전용 — fieldStore.directAttachments 참조).
//   - check-in: fieldId 만 (siteName·location 제거).
//   - check-in 직후 초기 status: 'completed' (백엔드 자동 설정).
//   - setResult: status + 'other' 일 때 reason 10자 이상 필수
//     (검증 2026-05-28: 백엔드가 visit_status_reason_required 로 강제).

type CheckInResult =
  | { ok: true; visit: Visit }
  | { ok: false; error: string };

type GenericResult =
  | { ok: true }
  | { ok: false; error: string };

interface VisitState {
  visits: Visit[];

  checkIn: (tripId: string, fieldId: string) => Promise<CheckInResult>;
  setResult: (visitId: string, status: VisitStatus, reason?: string) => Promise<GenericResult>;

  // 백엔드 list endpoint 가 없어 trip/field detail 응답의 timeline·recentVisits 로 hydrate.
  // 같은 visit id 면 status 만 갱신 (기존 행 보존), 새 id 면 추가.
  syncFromTimeline: (
    tripId: string,
    timeline: ReadonlyArray<{ visitId: string; fieldId?: string; visitedAt: string; status?: string }>,
  ) => void;
  syncFromRecentVisits: (
    fieldId: string,
    visits: ReadonlyArray<{ visitId: string; tripId: string; visitedAt: string; status?: string }>,
  ) => void;

  byTrip: (tripId: string) => Visit[];
  byField: (fieldId: string) => Visit[];
  getById: (id: string) => Visit | undefined;
  clearAll: () => void;
}

// merge 헬퍼 — 같은 visit.id 면 새 값으로 갱신, 없으면 추가. 결과는 새 array.
// timeline 응답은 fieldId 가 없어 ''로 채워져 들어오는데, 이전에 recentVisits 로 적재된
// 진짜 fieldId 를 ''로 덮으면 byField 조회가 깨짐. 빈 fieldId 면 existing 값 보존.
function mergeVisits(existing: Visit[], incoming: Visit[]): Visit[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((v) => [v.id, v]));
  for (const v of incoming) {
    const prev = byId.get(v.id);
    if (prev && !v.fieldId && prev.fieldId) {
      byId.set(v.id, { ...v, fieldId: prev.fieldId });
    } else {
      byId.set(v.id, v);
    }
  }
  return Array.from(byId.values());
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

  // trips.detail.timeline → visits hydrate. timeline entry 는 fieldId 가 optional 인데,
  // 없으면 fieldId 자리에 빈 string 으로 채워 store 에 적재 (UI 쪽 field lookup 은 ?? '알 수 없는 현장').
  // backend-backlog §16: 응답에 fieldId 가 정식 포함되면 세션 재진입 시에도 카드/마커가 정상 노출됨.
  syncFromTimeline: (tripId, timeline) => {
    const incoming: Visit[] = timeline.map((t) => ({
      id: t.visitId,
      status: normalizeVisitStatus(t.status),
      tripId,
      fieldId: t.fieldId ?? '',
      visitedAt: t.visitedAt,
    }));
    set((s) => ({ visits: mergeVisits(s.visits, incoming) }));
  },

  // fields.detail.recentVisits → visits hydrate. recentVisits 는 tripId·fieldId 모두 정상 제공.
  syncFromRecentVisits: (fieldId, list) => {
    const incoming: Visit[] = list.map((r) => ({
      id: r.visitId,
      status: normalizeVisitStatus(r.status),
      tripId: r.tripId,
      fieldId,
      visitedAt: r.visitedAt,
    }));
    set((s) => ({ visits: mergeVisits(s.visits, incoming) }));
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

  // 로그아웃 시 호출.
  clearAll: () => set({ visits: [] }),
}));

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
    timeline: ReadonlyArray<{ visitId: string; fieldId?: string; visitedAt: string; status?: string; reason?: string }>,
  ) => void;
  syncFromRecentVisits: (
    fieldId: string,
    visits: ReadonlyArray<{ visitId: string; tripId: string; visitedAt: string; status?: string; reason?: string }>,
  ) => void;

  byTrip: (tripId: string) => Visit[];
  byField: (fieldId: string) => Visit[];
  getById: (id: string) => Visit | undefined;
  removeByTrip: (tripId: string) => void;
  clearAll: () => void;
}

// merge 헬퍼 — 같은 visit.id 면 새 값으로 갱신, 없으면 추가. 결과는 새 array.
// 단, incoming 이 일부 필드를 비워서 들어오는 sync 소스가 있어 (timeline 은 fieldId 를 ''로,
// 일부 응답은 reason 을 누락) 이전에 채워둔 진짜 값을 덮으면 조회·표시가 깨진다.
//   - 빈 fieldId 면 existing fieldId 보존 (byField 조회 유지).
//   - reason 누락이면 existing reason 보존 (저장된 '기타' 사유 유실 방지, backend-backlog §21).
function mergeVisits(existing: Visit[], incoming: Visit[]): Visit[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((v) => [v.id, v]));
  for (const v of incoming) {
    const prev = byId.get(v.id);
    if (!prev) {
      byId.set(v.id, v);
      continue;
    }
    const merged = { ...v };
    if (!v.fieldId && prev.fieldId) merged.fieldId = prev.fieldId;
    if (v.reason == null && prev.reason != null) merged.reason = prev.reason;
    byId.set(v.id, merged);
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
      // 무조건 append 하면 안 된다 — 백엔드는 (외근, 현장) 기준 멱등이라 체크인 화면에
      // 다시 들어오면 같은 visitId 를 돌려준다(실측: 재진입 3회에도 방문 1건). 그때마다
      // 같은 id 행이 쌓이면 visits 를 세는 쪽(외근 목록 카드의 '방문 N', 주간 요약)이
      // 부풀려진다. 지금은 trip detail 진입 시 syncFromTimeline → mergeVisits 가 id 로
      // 접어줘 가려져 있을 뿐이라, 동일 헬퍼로 여기서부터 접는다.
      set((s) => ({ visits: mergeVisits(s.visits, [v]) }));
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
          v.id === visitId
            ? { ...v, status, reason: status === 'other' ? reason : undefined }
            : v,
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
      reason: t.reason,
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
      reason: r.reason,
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

  // 외근 삭제 시 호출 — 그 외근에 묶인 visit 행을 정리.
  removeByTrip: (tripId) => {
    set((s) => ({ visits: s.visits.filter((v) => v.tripId !== tripId) }));
  },

  // 로그아웃 시 호출.
  clearAll: () => set({ visits: [] }),
}));

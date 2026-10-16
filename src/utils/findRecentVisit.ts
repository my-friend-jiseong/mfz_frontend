// 결과를 모르는 체크인(응답 유실·시간 초과·5xx)을 다시 보내기 전에, 서버에 이미 생긴 방문을 찾는다.
// 서버 체크인은 멱등이 아니다(2026-10-17 실측: 같은 외근·현장에 두 번 보내면 방문 2건) — backlog 2차 H·J.
// 외근 상세 timeline 에서 그 현장의, 처음 보낸 시각(시계 차이만큼 앞당김) 이후 방문을 그 체크인으로 본다.
// RN import 없는 순수 함수 — 서버 조회는 utils/visitRecord 의 findCommittedCheckIn.

/** 서버·기기 시계 차이를 흡수할 여유. */
export const CHECKIN_CLOCK_SKEW_MS = 2 * 60 * 1000;

export interface TimelineVisitLike {
  visitId: string;
  fieldId?: string;
  visitedAt: string;
}

/**
 * timeline 에서 fieldId 의 방문 중 visitedAt >= attemptedAt - skewMs 인 것을 고른다.
 * 여럿이면 처음 보낸 시각에 가장 가까운 것(그 체크인이 만든 방문일 가능성이 가장 높다). 없으면 null.
 */
export function findRecentVisit<T extends TimelineVisitLike>(
  timeline: readonly T[] | null | undefined,
  args: { fieldId: string; attemptedAt: number; skewMs?: number },
): T | null {
  const since = args.attemptedAt - (args.skewMs ?? CHECKIN_CLOCK_SKEW_MS);
  let best: T | null = null;
  let bestGap = Infinity;
  for (const v of timeline ?? []) {
    if (!v.fieldId || v.fieldId !== args.fieldId) continue;
    const t = new Date(v.visitedAt).getTime();
    if (!Number.isFinite(t) || t < since) continue;
    const gap = Math.abs(t - args.attemptedAt);
    if (gap < bestGap) {
      best = v;
      bestGap = gap;
    }
  }
  return best;
}

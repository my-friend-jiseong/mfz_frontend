// 체크인 성공 알림 — visitStore 가 알리고 fieldStore 가 현장의 recentVisitedAt 을 고친다.
// fieldStore 가 이미 visitStore 를 import 하므로 반대 방향 import(순환)를 피하려고 따로 둔다.
// 목록을 다시 받기 전까지 1-3 '최근 방문일' 필터가 방금 들른 현장을 빼던 문제를 막는다.

type Listener = (fieldId: string, visitedAt: string) => void;

const listeners = new Set<Listener>();
// 아직 fieldStore 에 없는 현장(막 만든 현장 등)도 나중에 넣을 때 쓰도록 남겨 둔다.
const latest = new Map<string, string>();

/** 둘 중 늦은 시각. 못 읽는 값은 버린다. */
export function laterIso(a: string | null | undefined, b: string | null | undefined): string | null | undefined {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(tb)) return a;
  if (!Number.isFinite(ta)) return b;
  return tb > ta ? b : a;
}

export function emitCheckedIn(fieldId: string, visitedAt: string): void {
  const next = laterIso(latest.get(fieldId), visitedAt);
  if (next) latest.set(fieldId, next);
  listeners.forEach((l) => l(fieldId, visitedAt));
}

export function onCheckedIn(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 이 세션에서 그 현장에 마지막으로 체크인한 시각. */
export function latestCheckIn(fieldId: string): string | undefined {
  return latest.get(fieldId);
}

/** 로그아웃 — 다른 계정에 섞이지 않게. */
export function clearCheckIns(): void {
  latest.clear();
}

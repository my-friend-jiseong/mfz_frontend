// 외근 시작 전 단계의 클라이언트 측 동선 최적화 (nearest neighbor + Haversine).
// 백엔드 POST /api/trips/optimize-preview·{tripId}/navigation/optimize 호출이 실패했을 때의
// 폴백, 또는 그 두 endpoint 를 아예 쓸 수 없는 화면에서 사용한다.

// 백엔드 알고리즘 코드(backend-backlog §5·§22, 2026-08-18 결과보고서 §3.2) → 사용자 표시용 한국어.
// 모르는 코드는 원문 그대로 보여준다 — 새 알고리즘이 추가돼도 화면이 깨지지 않게.
const OPTIMIZE_ALGORITHM_LABEL: Record<string, string> = {
  exhaustive_straight_line: '완전탐색 (직선거리)',
  nearest_neighbor: '최근접 이웃',
};

export function describeOptimizeAlgorithm(algorithm: string): string {
  return OPTIMIZE_ALGORITHM_LABEL[algorithm] ?? algorithm;
}

const EARTH_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

export interface OptimizeNode {
  id: string;
  lat: number;
  lng: number;
}

/**
 * 출발지(start) 에서 가장 가까운 점부터 순회.
 * 입력 nodes 의 순서를 유지한 채 새 배열을 반환 (각 단계의 거리·누적 ETA 포함).
 */
export function nearestNeighborOrder<T extends OptimizeNode>(
  start: { lat: number; lng: number },
  nodes: T[],
  /** 평균 시속 (km/h) — ETA 계산용. 도심 차량 기준 기본 35 */
  avgSpeedKmh = 35,
): Array<T & { distanceFromPrevKm: number; etaMinutes: number }> {
  const remaining = [...nodes];
  const ordered: Array<T & { distanceFromPrevKm: number; etaMinutes: number }> = [];
  let cursor: { lat: number; lng: number } = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0];
    ordered.push({
      ...picked,
      distanceFromPrevKm: Math.round(bestDist * 100) / 100,
      etaMinutes: Math.max(1, Math.round((bestDist / avgSpeedKmh) * 60)),
    });
    cursor = picked;
  }

  return ordered;
}

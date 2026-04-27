// 외근 시작 전 단계의 클라이언트 측 동선 최적화 (nearest neighbor + Haversine).
// 백엔드 POST /api/trips/{tripId}/navigation/optimize 는 외근 시작 후의 tripId 만
// 허용하므로 (404 "Trip or visit not found"), 외근 시작 전 미리보기는 클라이언트 측에서.
// 알고리즘은 백엔드와 동일한 nearest_neighbor 라 결과가 거의 일치.

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

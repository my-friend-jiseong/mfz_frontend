// Quick Photo(빠른 촬영) — 촬영 위치에서 가까운 현장 매칭.
// 계획: docs/reference/AUTO_PICTURE_REGISTRATION_PLAN.md §4-2
//
// RN/expo import 없는 순수 모듈로 유지할 것 — node 단독 단위 테스트 대상
// (npm test → src/utils/__tests__/nearestField.test.ts).
import { haversineKm } from './routeOptimize';

/** 이 거리(m) 이내 현장이 없으면 자동 매칭 대신 수동 선택 폴백. */
export const QUICK_PHOTO_MAX_DISTANCE_M = 100;

export interface NearbyField<T> {
  field: T;
  distanceM: number;
}

/**
 * 현 위치에서 maxDistanceM 이내인 현장을 거리 오름차순으로 반환.
 * Field 전체 타입 대신 구조 타입(latitude/longitude)만 요구 — 좌표 결측·비정상값은
 * 방어적으로 제외한다 (모델상 필수지만 크래시 금지, 계획 §6-8).
 */
export function findNearbyFields<T extends { latitude: number; longitude: number }>(
  pos: { lat: number; lng: number },
  fields: T[],
  maxDistanceM: number = QUICK_PHOTO_MAX_DISTANCE_M,
): Array<NearbyField<T>> {
  return fields
    .filter((f) => Number.isFinite(f.latitude) && Number.isFinite(f.longitude))
    .map((f) => ({
      field: f,
      distanceM: haversineKm(pos, { lat: f.latitude, lng: f.longitude }) * 1000,
    }))
    .filter((e) => e.distanceM <= maxDistanceM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** 확인 시트 표시용 — 1km 미만은 m 정수, 이상은 km 한 자리. */
export function formatDistanceM(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

import * as Location from 'expo-location';
import { trips as tripsApi } from '@/api';

// 외근 자동화 — 도착 자동 감지 (foreground only).
// 백그라운드 추적은 별도 권한·OS 정책이 복잡해 1차에선 foreground 만.
//
// 정책:
// - 외근 시작 직후 모든 방문 현장에 geofence register (백엔드 감사 로그 + 향후 활용).
// - 활성 외근 화면이 켜진 동안 위치 watcher 가 일정 주기로 위치 측정.
// - 가장 가까운 pending 현장과의 거리가 ARRIVAL_RADIUS_M 이내면 도착 알림 (1현장 1회).
// - 백엔드 endpoint 응답 무시 (best-effort, silent fail).

export const ARRIVAL_RADIUS_M = 150;
const WATCHER_TIME_INTERVAL_MS = 15_000;
const WATCHER_DISTANCE_INTERVAL_M = 30;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 외근 시작 시 각 방문 현장에 geofence 등록 (best-effort).
 * 백엔드 endpoint 가 비활성이거나 4xx/5xx 면 silent skip.
 */
export async function registerGeofencesForTrip(
  tripId: string,
  fields: Array<{ id: string; latitude: number; longitude: number }>,
): Promise<void> {
  await Promise.all(
    fields.map(async (f) => {
      try {
        await tripsApi.registerGeofence(tripId, {
          fieldId: f.id,
          lat: f.latitude,
          lng: f.longitude,
          radiusMeters: ARRIVAL_RADIUS_M,
        });
      } catch {
        // best-effort — 백엔드 미작동·권한 등 문제 시 silent
      }
    }),
  );
}

export interface ArrivalTarget {
  fieldId: string;
  fieldName: string;
  lat: number;
  lng: number;
}

export interface ArrivalEvent {
  fieldId: string;
  fieldName: string;
  distanceMeters: number;
  arrivedAt: string; // ISO8601
}

/**
 * Foreground 위치 watcher 를 시작. 도착 감지 시 onArrival 콜백 1회 (현장당).
 * targets 가 변경되면 호출자가 stop() 후 다시 시작.
 *
 * 반환: stop 함수.
 * 권한 거부 / 위치 미지원 환경: 즉시 stop 함수만 반환 (silent).
 */
export async function startArrivalWatcher(
  tripId: string,
  initialTargets: ArrivalTarget[],
  onArrival: (event: ArrivalEvent) => void,
): Promise<() => void> {
  const announced = new Set<string>();
  let subscription: Location.LocationSubscription | null = null;

  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      return () => {};
    }
  } catch {
    return () => {};
  }

  let targets = initialTargets;

  try {
    subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: WATCHER_TIME_INTERVAL_MS,
        distanceInterval: WATCHER_DISTANCE_INTERVAL_M,
      },
      (loc) => {
        const here = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        for (const t of targets) {
          if (announced.has(t.fieldId)) continue;
          const d = haversineMeters(here, { lat: t.lat, lng: t.lng });
          if (d <= ARRIVAL_RADIUS_M) {
            announced.add(t.fieldId);
            const arrivedAt = new Date().toISOString();
            // best-effort 백엔드 보고 (무시)
            void tripsApi
              .notifyGeofenceArrival(tripId, { fieldId: t.fieldId, arrivedAt })
              .catch(() => {});
            onArrival({ fieldId: t.fieldId, fieldName: t.fieldName, distanceMeters: d, arrivedAt });
          }
        }
      },
    );
  } catch {
    // location services 미지원 — silent
    return () => {};
  }

  return () => {
    if (subscription) {
      subscription.remove();
      subscription = null;
    }
  };
}

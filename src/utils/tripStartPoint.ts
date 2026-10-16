import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LatLng } from './geolocation';

// [출발]한 곳 — 7 외근 진행의 출발 표시(흰 원·검은 테두리)와 지나온 길(회색 실선)의 시작점.
// 서버가 출발 좌표를 저장하지 않아(backlog 2차 B) 기기에만 둔다. 진행 중 외근 하나만 기억한다.

const STORAGE_KEY = 'mfz.tripStart.v1';
let cache: { tripId: string; point: LatLng } | null = null;

export function saveTripStartPoint(tripId: string, point: LatLng): void {
  cache = { tripId, point };
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {});
}

export async function loadTripStartPoint(tripId: string): Promise<LatLng | null> {
  if (cache?.tripId === tripId) return cache.point;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as typeof cache) : null;
    if (v && v.tripId === tripId && typeof v.point?.lat === 'number' && typeof v.point?.lng === 'number') {
      cache = v;
      return v.point;
    }
  } catch {
    /* ignore */
  }
  return null;
}

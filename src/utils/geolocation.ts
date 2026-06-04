import * as Location from 'expo-location';

export interface LatLng {
  lat: number;
  lng: number;
}

// 권한 거부·오류는 silent (null 반환) — 지도는 기본 중심으로 fallback.
// 한 번만 호출하기를 가정 — 캐싱은 호출 측에서 useState/useEffect 로.
// high: Quick Photo 처럼 수십 m 단위 판정이 필요한 곳만 (Balanced 는 ~100m 오차).
export async function requestUserLocation(opts?: {
  high?: boolean;
}): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: opts?.high ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

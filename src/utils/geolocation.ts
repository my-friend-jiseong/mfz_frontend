import * as Location from 'expo-location';

export interface LatLng {
  lat: number;
  lng: number;
}

// 권한 거부·오류는 silent (null 반환) — 지도는 기본 중심으로 fallback.
// 한 번만 호출하기를 가정 — 캐싱은 호출 측에서 useState/useEffect 로.
export async function requestUserLocation(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

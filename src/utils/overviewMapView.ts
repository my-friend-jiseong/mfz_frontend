import AsyncStorage from '@react-native-async-storage/async-storage';

// 보고서 위치도의 사용자 지정 범위(center+level). 없으면 위치도는 현장 전체 자동 맞춤이다.
// 서버에 저장할 필드가 없어 기기에만 둔다(backend-backlog §41) — 문서에 들어가는 건 내보내기 때
// 이 범위로 캡처해 올린 이미지라, 다른 기기에서 다시 내보내기 전까지는 결과가 유지된다.
export interface OverviewMapView {
  lat: number;
  lng: number;
  level: number;
}

const keyOf = (reportId: string) => `report-overview-view:${reportId}`;

export async function loadOverviewMapView(reportId: string): Promise<OverviewMapView | null> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(reportId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.lat === 'number' && typeof v?.lng === 'number' && typeof v?.level === 'number') return v;
    return null;
  } catch {
    return null;
  }
}

// null 이면 지정 범위를 지우고 자동 맞춤으로 돌아간다.
export async function saveOverviewMapView(reportId: string, view: OverviewMapView | null): Promise<void> {
  try {
    if (view) await AsyncStorage.setItem(keyOf(reportId), JSON.stringify(view));
    else await AsyncStorage.removeItem(keyOf(reportId));
  } catch {
    // 저장 실패는 이번 세션 화면 상태로만 남는다 — 범위 조정 자체를 막을 이유는 없다.
  }
}

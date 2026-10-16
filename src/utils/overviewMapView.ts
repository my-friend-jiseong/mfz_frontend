import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

// 보고서 위치도의 사용자 지정 구도(center+level, 9-7). 없으면 위치도는 현장 전체 자동 맞춤이다.
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
    // 저장 실패는 이번 세션 화면 상태로만 남는다 — 구도 잡기 자체를 막을 이유는 없다.
  }
}

// 화면들(9-2·9-6·9-3 위치도 카드, 9-7 구도)이 같은 값을 보게 메모리에 둔다. undefined = 아직 안 읽음.
interface ViewState {
  views: Record<string, OverviewMapView | null | undefined>;
  load: (reportId: string) => Promise<void>;
  save: (reportId: string, view: OverviewMapView | null) => Promise<void>;
}

export const useOverviewMapViewStore = create<ViewState>((set, get) => ({
  views: {},
  load: async (reportId) => {
    if (get().views[reportId] !== undefined) return;
    const v = await loadOverviewMapView(reportId);
    if (get().views[reportId] === undefined) set((s) => ({ views: { ...s.views, [reportId]: v } }));
  },
  save: async (reportId, view) => {
    set((s) => ({ views: { ...s.views, [reportId]: view } }));
    await saveOverviewMapView(reportId, view);
  },
}));

/** 보고서 위치도의 저장된 구도. undefined = 읽는 중, null = 자동 맞춤. */
export function useOverviewMapView(reportId: string): OverviewMapView | null | undefined {
  const view = useOverviewMapViewStore((s) => s.views[reportId]);
  useEffect(() => {
    if (reportId) void useOverviewMapViewStore.getState().load(reportId);
  }, [reportId]);
  return view;
}

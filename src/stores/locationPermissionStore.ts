import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import {
  getLocationPermission,
  requestLocationPermission,
  type LocationPermission,
} from '@/utils/geolocation';

// 위치 권한 상태(1-1·1-2) — 지도(내 위치 버튼 모양)와 외근 시작 버튼이 같은 값을 본다.
// 설정 앱에서 켜고 돌아오면(AppState active) 다시 읽는다.
interface LocationPermissionState {
  /** 처음 읽기 전에는 null — 그 사이엔 꺼진 모양을 그리지 않는다. */
  status: LocationPermission | null;
  /** 1-2 시트가 떠 있는가. 지도·외근 시작 어디서 열어도 같은 시트. */
  sheetOpen: boolean;
  refresh: () => Promise<LocationPermission>;
  request: () => Promise<LocationPermission>;
  openSheet: () => void;
  closeSheet: () => void;
}

export const useLocationPermissionStore = create<LocationPermissionState>((set) => ({
  status: null,
  sheetOpen: false,
  refresh: async () => {
    const status = await getLocationPermission();
    set({ status });
    return status;
  },
  request: async () => {
    const status = await requestLocationPermission();
    set({ status });
    return status;
  },
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
}));

/** 마운트할 때와 앱으로 돌아올 때 권한을 다시 읽고 지금 상태를 돌려준다. */
export function useLocationPermission(): LocationPermission | null {
  const status = useLocationPermissionStore((s) => s.status);
  useEffect(() => {
    const { refresh } = useLocationPermissionStore.getState();
    void refresh();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void refresh();
    });
    return () => sub.remove();
  }, []);
  return status;
}

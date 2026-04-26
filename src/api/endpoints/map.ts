import { request } from '../client';

// /api/map/fields 는 admin 전용 (smoke test 일반 계정 → 403).
// 일반 사용자는 fields.listMine 으로 좌표 보강된 응답이 필요한지 확인 후 사용.

export interface MapField {
  // 백엔드 응답 shape 미캡처 (admin 필요)
  [key: string]: unknown;
}

export const map = {
  fields: (params?: { bbox?: string }) =>
    request<{ items: MapField[] }>('/api/map/fields', { query: params }),

  currentLocationConfig: () =>
    request<unknown>('/api/map/current-location-config'),
};

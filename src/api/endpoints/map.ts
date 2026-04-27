import { request } from '../client';

// 본 서비스에는 단일 Actor (필드 워커) 만 존재.
// `/api/map/fields` 는 백엔드 스펙상 다른 권한이 가정된 endpoint 라 사용하지 않음 — 본 서비스의 지도 마커는 fields.listMine 의 lat/lng 응답을 사용.

export const map = {
  currentLocationConfig: () =>
    request<unknown>('/api/map/current-location-config'),
};

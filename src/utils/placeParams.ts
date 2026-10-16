import type { AddressSearchItem } from '@/api';

// 5-2 등록 안 된 위치 화면(trips/fields/place)에 넘기는 값. URL 에 싣는다 — 웹 새로고침에도 다시 그릴 수 있게.

export interface PlaceRouteParams {
  name: string;
  road: string;
  jibun: string;
  cat: string;
  lat: string;
  lng: string;
  sido: string;
  sigungu: string;
  q: string;
  [key: string]: string;
}

export function placeParams(item: AddressSearchItem, q: string): PlaceRouteParams {
  return {
    name: item.buildingName ?? '',
    road: item.roadAddress,
    jibun: item.jibunAddress,
    cat: item.placeCategory ?? '',
    lat: String(item.lat),
    lng: String(item.lng),
    sido: item.sido ?? '',
    sigungu: item.sigungu ?? '',
    q,
  };
}

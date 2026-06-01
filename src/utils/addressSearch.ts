// 카카오 Geocoder 검색 결과를 다루는 공용 헬퍼.
// fields/new.tsx (현장 등록) 와 fields/[id]/edit.tsx (현장 수정) 가 공유.

import type { AddressSearchItem } from '@/api';

// 사용자 선택 결과 통합 타입 — 카카오 Geocoder 응답 또는 수동 입력 fallback.
export interface SelectedAddress {
  roadAddress: string;
  jibunAddress: string;
  buildingName: string | null;
  sido?: string;
  sigungu?: string;
  lat: number;
  lng: number;
  // 표시용 라벨 (카드/배지)
  display: string;
}

// 핀 드래그/탭 후 좌표→주소 역지오코딩(kakao Geocoder.coord2Address)으로 해석된 결과.
// FieldPinMap(.native/.web) 이 동일 shape 로 emit → 호출부가 SelectedAddress 에 병합.
export interface PinAddress {
  roadAddress: string;
  jibunAddress: string;
  buildingName: string | null;
  sido?: string;
  sigungu?: string;
  display: string;
}

export function itemToSelected(item: AddressSearchItem): SelectedAddress {
  const display = item.buildingName
    ? `${item.roadAddress} (${item.buildingName})`
    : item.roadAddress || item.jibunAddress;
  return {
    roadAddress: item.roadAddress,
    jibunAddress: item.jibunAddress,
    buildingName: item.buildingName,
    sido: item.sido,
    sigungu: item.sigungu,
    lat: item.lat,
    lng: item.lng,
    display,
  };
}

export const SEARCH_DEBOUNCE_MS = 300;
export const MIN_KEYWORD_LEN = 2;

// 한국 영역 사전 경고 (백엔드 검증과 동일 범위 — 사용자 즉각 피드백)
export const KR_LAT = { min: 33, max: 43 };
export const KR_LNG = { min: 124, max: 132 };

export const isInKorea = (lat: number, lng: number): boolean =>
  lat >= KR_LAT.min && lat <= KR_LAT.max && lng >= KR_LNG.min && lng <= KR_LNG.max;

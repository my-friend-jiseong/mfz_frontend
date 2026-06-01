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

// 주소 검색(백엔드)·장소 키워드 검색(클라이언트 카카오 SDK) 결과를 합친다.
// primary(주소) 를 앞에, secondary(장소) 를 뒤에 — 도로명 검색 시 기존 동작 보존,
// 장소명 검색 시 백엔드가 0건이어도 키워드 결과로 채워짐. 좌표+도로명으로 중복 제거.
export function mergeSearchItems(
  primary: readonly AddressSearchItem[],
  secondary: readonly AddressSearchItem[],
): AddressSearchItem[] {
  const keyOf = (it: AddressSearchItem) =>
    `${(it.roadAddress || it.jibunAddress).trim().toLowerCase()}|${it.lat.toFixed(5)}|${it.lng.toFixed(5)}`;
  const seen = new Set<string>();
  const out: AddressSearchItem[] = [];
  for (const it of [...primary, ...secondary]) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue;
    const k = keyOf(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export const SEARCH_DEBOUNCE_MS = 300;
export const MIN_KEYWORD_LEN = 2;

// 한국 영역 사전 경고 (백엔드 검증과 동일 범위 — 사용자 즉각 피드백)
export const KR_LAT = { min: 33, max: 43 };
export const KR_LNG = { min: 124, max: 132 };

export const isInKorea = (lat: number, lng: number): boolean =>
  lat >= KR_LAT.min && lat <= KR_LAT.max && lng >= KR_LNG.min && lng <= KR_LNG.max;

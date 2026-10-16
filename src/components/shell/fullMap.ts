import { router } from 'expo-router';
import type { MapPath, MapPinKind } from '@/components/KakaoMapWebView';
import type { LatLng } from '@/utils/geolocation';

// 공통 전체 지도(3-8 경로 지도 · 3-9 / 5-10 / 8-9~8-12 위치 지도) 인자.
// 핀·경로처럼 URL 에 싣기엔 큰 값이라 메모리에 두고 id 만 넘긴다. 웹 새로고침으로 값이 사라지면
// 빈 지도에 닫기 버튼만 남는다(닫으면 연 화면으로).

export interface FullMapPin {
  id: string;
  lat: number;
  lng: number;
  kind: MapPinKind;
  /** 외근 목적지 순번(Pin/Number). */
  order?: number;
  /** 이 화면의 주인공 핀 — 1.19배 + 바닥 타원. */
  selected?: boolean;
  /** 스크린리더용 이름. */
  label?: string;
}

/** 3-8 아래 '경로 순서' 카드 한 줄. */
export interface FullMapLegendRow {
  key: string;
  /** 'start' = 출발(흰 원·검은 테두리), 숫자 = 순번 원(kind 색). */
  marker: 'start' | { order: number; kind: MapPinKind };
  label: string;
  trailing?: string;
  trailingTone?: 'tertiary' | 'brand' | 'success' | 'warning';
  /** 건너뜀처럼 흐리게(opacity 0.6). */
  dim?: boolean;
}

export interface FullMapSpec {
  /** 머리 알약 문구. 예: '하신중앙로 점검 · 10월 6일', '당리동 312-7 부근 · 오차 ±48m' */
  title: string;
  pins: FullMapPin[];
  /** GPS 오차 원(8-12). radius 는 미터. */
  accuracyCircle?: { lat: number; lng: number; radius: number } | null;
  /** 경로선(3-8). */
  paths?: MapPath[];
  /** 출발 위치(3-8). */
  startPoint?: LatLng | null;
  /** 내 위치 점(8-9~8-12). */
  myLocation?: LatLng | null;
  /** 주변 현장 핀도 함께(3-9·5-10·8-9~8-12). pins 에 없는 내 현장 중 가까운 것을 더한다. */
  nearbyFields?: boolean;
  /** 3-8 경로 순서 카드. 없으면 카드를 그리지 않는다. */
  legend?: FullMapLegendRow[];
}

// 닫을 때 지우지 않는다 — 개발 모드 이중 마운트·웹 앞으로 가기에서 같은 id 를 다시 읽는다. 최근 것만 남긴다.
const KEEP = 10;
const specs = new Map<string, FullMapSpec>();
let seq = 0;

export function getFullMapSpec(id: string | undefined): FullMapSpec | undefined {
  return id ? specs.get(id) : undefined;
}

/** 전체 지도 모달을 연다. 닫기(X)는 router.back — 연 화면으로 돌아간다. */
export function openFullMap(spec: FullMapSpec): void {
  const id = `m${Date.now().toString(36)}${(++seq).toString(36)}`;
  specs.set(id, spec);
  if (specs.size > KEEP) specs.delete(specs.keys().next().value as string);
  router.push({ pathname: '/map', params: { id } } as never);
}

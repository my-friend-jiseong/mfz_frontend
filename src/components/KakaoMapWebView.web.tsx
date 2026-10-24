import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Field, FieldStatus } from '@/types/entities';
import { FIELD_STATUS_LABEL } from '@/types/entities';
import h337 from 'heatmap.js';
import type { MapDisplayMode, BaseMapType } from '@/assets/kakaoMapHtml';
import { HEAT_GRADIENT, HEAT_CONFIG, HEAT_MAX, heatRadiusForLevel } from '@/theme/heatScale';
import { loadSigunguGeoJson, aggregateByRegion } from '@/assets/boundaries/sigungu';
import { fillOpacityForCount, CHOROPLETH_COLOR } from '@/theme/choroplethScale';
import { colors } from '@/theme/colors';
import { spacing, fontSize } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';
import { groupSameLocationMarkers } from '@/utils/groupSameLocationMarkers';
import { MapClusterSheet } from '@/components/map/MapClusterSheet';
import {
  ACCURACY_CIRCLE_STYLE,
  ACCURACY_CIRCLE_STYLE_BRAND,
  CLUSTER_PIN_PRIORITY,
  PIN_CLUSTER_PX,
  PIN_TIP_Y_RATIO,
  START_POINT_HTML,
  buildPinHtml,
  isClusterablePin,
  pathStyle,
  pinScaleForLevel,
  wrapPinHtml,
  type AccuracyTone,
  type MapPath,
  type MapPinKind,
  type PinSelectedSize,
} from '@/assets/mapPins';
import { CARD_DOT_PAD, CARD_FIT_PADDING, CARD_PIN_SCALE, circleExtremes, closestFitLevel } from '@/utils/cardMapFit';
import { fitCamera, zoomAnchor, type Pt } from '@/utils/mapCamera';
import { duration } from '@/theme/motion';

export type { MapPath, MapPinKind, PinSelectedSize };

export interface KakaoMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  shape?: 'triangle' | 'circle' | 'check';
  badge?: string;
  // 외근 방문 순번(1-based). 있으면 '숫자를 새긴 원' 으로 그린다. 네이티브와 동일.
  order?: number;
  // 현장 선택 모드 — true 면 brand 링+✓ 오버레이(상태색·형상 유지). 네이티브와 동일.
  selected?: boolean;
  // 검색 결과 하이라이트 — true 면 brand 링+핑 펄스(selected 와 독립).
  highlighted?: boolean;
  // 2차 핀 — 네이티브와 동일(KakaoMapWebView.tsx 주석).
  pin?: MapPinKind;
  selectedSize?: PinSelectedSize;
  nameTag?: string;
  /** 겹친 핀 고르기 시트에서 상태 뒤에 붙는 회색 글(구·동 등). */
  sublabel?: string;
}

// KWCAG 1.4.1 — 색 + 형상 + 라벨 3중 인코딩.
const STATUS_TO_SHAPE: Record<FieldStatus, 'triangle' | 'circle' | 'check'> = {
  pending: 'triangle',
  in_progress: 'circle',
  done: 'check',
};
const STATUS_TO_BADGE: Record<FieldStatus, string> = FIELD_STATUS_LABEL;

// 라벨은 레벨 ≤ LABEL_MAX_LEVEL 일 때만 — 밀집 시 라벨 박스 겹침으로 난잡해지는 것 방지.
const LABEL_MAX_LEVEL = 5;
// 화면상 이 픽셀 반경 안의 마커는 한 클러스터로 묶는다(줌마다 재계산).
// 마커 SVG 가 26px 이라 28 이면 사실상 겹치는 것만 묶음 — 점을 최대한 살려 허전함 방지.
const CLUSTER_PX = 28;

function buildMarkerHtml(
  m: KakaoMapMarker,
  count = 1,
  showLabel = true,
  orderOverride?: number | null,
): string {
  const color = m.color || '#2563eb';
  const shape = m.shape || 'circle';
  const badge = m.badge || '';
  let svg: string;
  if (shape === 'triangle') {
    svg = `<svg width="26" height="26" viewBox="0 0 36 36"><polygon points="18,4 32,30 4,30" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  } else if (shape === 'check') {
    svg = `<svg width="26" height="26" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${color}" stroke="#fff" stroke-width="2"/><polyline points="11,18 16,23 25,13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else {
    svg = `<svg width="26" height="26" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  }
  // 클러스터(count>1): 우상단 카운트 뱃지 — head 좌표는 안 움직임, 다중임만 명시.
  const countBadge =
    count > 1
      ? `<div style="position:absolute;top:-4px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);box-sizing:border-box;">${count}</div>`
      : '';
  // 라벨은 absolute 로 SVG(26×26) 아래에 띄움 — anchor 박스를 SVG 로 한정해 줌 무관 정렬.
  const labelHtml = showLabel
    ? `<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ${color};white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">${badge ? `<span style="color:${color};">${badge}</span> · ` : ''}${m.label || ''}</div>`
    : '';
  // 선택 표시(현장 선택 모드) — 상태색·형상 유지, brand 링+✓ 만 덧댐. 클러스터는 단일만(count===1).
  const selected = m.selected && count === 1;
  const selRing = selected
    ? `<div style="position:absolute;top:50%;left:50%;width:34px;height:34px;transform:translate(-50%,-50%);border:3px solid #2563eb;border-radius:50%;box-sizing:border-box;box-shadow:0 0 0 2px #fff;"></div>`
    : '';
  const selCheck = selected
    ? `<div style="position:absolute;bottom:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:#2563eb;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-sizing:border-box;"><svg width="9" height="9" viewBox="0 0 24 24"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
    : '';
  // 검색 하이라이트(단일 마커) — selected 와 독립. 키프레임은 ensureHighlightStyle 로 주입.
  const highlighted = m.highlighted && count === 1;
  const hlRing = highlighted
    ? `<div class="mfz-hl-static"></div><div class="mfz-hl-ping"></div>`
    : '';
  // 외근 순번 마커 — 형상 대신 '숫자를 새긴 원'. 정보 전달자가 형상→숫자로 바뀔 뿐이라
  // 색 단독 인코딩이 되지는 않는다. 클러스터도 순번을 살린다 — 원 안엔 구성원 중 가장 빠른
  // 순번(orderOverride), 우상단엔 카운트 뱃지. (네이티브 HTML 과 동일 규칙)
  //
  // ★ 라벨은 status 뱃지를 포함한 labelHtml 을 그대로 쓴다 — 순번 마커는 형상을 원으로
  //   고정하므로 라벨에서까지 status 텍스트를 빼면 status 가 색 단독이 된다(KWCAG 1.4.1).
  const ord = orderOverride ?? m.order;
  if (typeof ord === 'number') {
    const orderSvg = `<svg width="26" height="26" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
    const orderNum = `<div style="position:absolute;top:0;left:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;pointer-events:none;">${ord}</div>`;
    return `<div style="position:relative;width:26px;height:26px;cursor:pointer;">${hlRing}${selRing}${orderSvg}${orderNum}${countBadge}${selCheck}${labelHtml}</div>`;
  }
  return `<div style="position:relative;width:26px;height:26px;cursor:pointer;">${hlRing}${selRing}${svg}${countBadge}${selCheck}${labelHtml}</div>`;
}

// minOrder — 클러스터가 보여줄 순번(구성원 중 최솟값). head 는 좌표 무손실을 위해 첫 마커로
// 고정해야 하므로 순번만 따로 모은다. 순번 없는 마커만 모이면 null.
type PixelCluster = {
  head: KakaoMapMarker;
  count: number;
  ids: string[];
  minOrder: number | null;
};

// 화면 픽셀 거리 기반 클러스터링. 두 좌표의 화면 거리는 pan 에 불변·줌에만 의존하므로
// 줌 변화 시에만 재계산하면 된다. 그리드 버킷으로 인접 3×3 셀만 검사해 O(n) 에 가깝게 묶는다.
function clusterByPixel(
  markers: KakaoMapMarker[],
  proj: MapProjection,
  makeLatLng: (lat: number, lng: number) => unknown,
  radiusPx: number = CLUSTER_PX,
): PixelCluster[] {
  type Node = PixelCluster & { px: number; py: number };
  const buckets = new Map<string, Node[]>();
  const clusters: Node[] = [];
  for (const m of markers) {
    const pt = proj.containerPointFromCoords(makeLatLng(m.lat, m.lng));
    const gx = Math.floor(pt.x / radiusPx);
    const gy = Math.floor(pt.y / radiusPx);
    let placed: Node | null = null;
    for (let dx = -1; dx <= 1 && !placed; dx++) {
      for (let dy = -1; dy <= 1 && !placed; dy++) {
        const arr = buckets.get(`${gx + dx}:${gy + dy}`);
        if (!arr) continue;
        for (const cl of arr) {
          const ddx = cl.px - pt.x;
          const ddy = cl.py - pt.y;
          if (ddx * ddx + ddy * ddy <= radiusPx * radiusPx) {
            placed = cl;
            break;
          }
        }
      }
    }
    if (placed) {
      placed.count++;
      placed.ids.push(m.id);
      if (
        typeof m.order === 'number' &&
        (placed.minOrder === null || m.order < placed.minOrder)
      ) {
        placed.minOrder = m.order;
      }
    } else {
      const node: Node = {
        head: m,
        count: 1,
        ids: [m.id],
        px: pt.x,
        py: pt.y,
        minOrder: typeof m.order === 'number' ? m.order : null,
      };
      clusters.push(node);
      const bk = `${gx}:${gy}`;
      const arr = buckets.get(bk);
      if (arr) arr.push(node);
      else buckets.set(bk, [node]);
    }
  }
  return clusters;
}

interface Props {
  markers: KakaoMapMarker[];
  center?: { lat: number; lng: number };
  // 초기 줌 레벨 — 마지막 뷰 복원용(미지정 시 8).
  initialLevel?: number;
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  // 베이스 지도 종류 — 일반/위성/하이브리드(미지정 시 일반). 데이터 오버레이(displayMode)와 직교.
  baseMapType?: BaseMapType;
  myLocation?: { lat: number; lng: number } | null;
  // 검색한 '새 위치' 비컨 — 좌표에 핀을 떨어뜨려 등록 전 위치를 보여준다(null 이면 제거).
  beacon?: { lat: number; lng: number } | null;
  // 외근 동선 — 목적지 순서대로 잇는 점선. 2점 미만이면 선을 그리지 않는다.
  route?: { lat: number; lng: number }[];
  // 2차 경로선·오차 원·출발 위치 — 네이티브와 동일.
  paths?: MapPath[];
  circle?: { lat: number; lng: number; radius: number; tone?: AccuracyTone } | null;
  startPoint?: { lat: number; lng: number } | null;
  // true 면 모든 마커가 한 화면에 들어오도록 자동 프레이밍 (center 무시). 위치도 미리보기용.
  fitToMarkers?: boolean;
  // fitToMarkers 로 맞출 때 핀과 함께 화면에 넣을 점(네이티브와 동일).
  fitExtra?: { lat: number; lng: number }[];
  // fitToMarkers 여백(위·오른쪽·아래·왼쪽 px). 지도 위를 덮는 카드가 있으면 그만큼(3-8 경로 순서 카드).
  fitPadding?: [number, number, number, number];
  // 있으면 fitToMarkers 는 이 값이 바뀔 때만 다시 맞춘다(마커 배열을 새로 만들 때마다가 아니라). 사용자가 지도를
  // 끌거나 줌한 뒤에는 다시 맞추지 않는다(7 외근 진행 — 목적지 좌표 묶음을 키로 넘긴다). 네이티브와 같다.
  fitKey?: string;
  // 카카오 축척 막대 숨김(정적 지도 카드 MapPreviewCard 전용). 로고는 남는다.
  hideScale?: boolean;
  // 정적 지도 카드(3·5·8 MapPreviewCard, 9 보고서 위치도·9-7) 전용: 핀 0.75배·선택 확대 없음, fitToMarkers 는
  // 점(+fitExtra·오차 원)이 여백 안에 들어가는 가장 가까운 레벨로 맞춘다(utils/cardMapFit). 전체 지도는 쓰지 않는다.
  compactPins?: boolean;
  // compactPins 핀 배율(기본 0.75). 보고서 위치도만 더 작게 쓴다(ReportParts OVERVIEW_PIN_SCALE).
  pinScale?: number;
  // false 면 드래그/줌 비활성 — BottomSheet 안 등 pan 충돌 회피용 정적 위치도.
  interactive?: boolean;
  onMarkerPress?: (fieldId: string) => void;
  onLongPress?: (p: { lat: number; lng: number }) => void;
  // 핀이 아닌 빈 곳을 눌렀을 때(선택 카드 닫기 등). 핀을 누른 직후·길게 누른 직후의 지도 click 은 오지 않는다.
  onMapPress?: () => void;
  // 지도 뷰(center+level)가 정착할 때마다 보고 — 상위가 기억해 재마운트 시 복원에 사용.
  onViewChange?: (view: { lat: number; lng: number; level: number }) => void;
  // 크기가 바뀌면(첫 레이아웃) center 로 다시 맞춘다 — 사용자가 끌기 전까지만. 저장한 구도로 그리는 보고서 위치도 카드 전용.
  holdCenterOnResize?: boolean;
  // 네이티브 전용 — shape 만 맞춘다(호출하지 않음). 안드로이드는 부모 ScrollView 가 지도
  // 드래그를 가로채 이 신호로 스크롤을 잠그지만, 웹은 카카오 SDK 가 컨테이너에
  // touch-action:none 을 걸어 경합이 없다. 여기서 호출하면 오히려 웹 스크롤이 잠긴다.
  onInteractionChange?: (active: boolean) => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 };
// 동작 줄이기면 카메라를 움직이지 않고 바로 옮긴다.
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const MAP_PRESS_PIN_GAP_MS = 400;
const SDK_SCRIPT_ID = '__kakao_maps_sdk__';
const MY_LOC_PULSE_KEYFRAMES_ID = '__mfz_me_pulse__';

function ensureMyLocPulseStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MY_LOC_PULSE_KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = MY_LOC_PULSE_KEYFRAMES_ID;
  style.textContent =
    '@keyframes mfzPulse { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }' +
    '.mfz-me-ring { animation: mfzPulse 1.6s ease-out infinite; }' +
    // 동작 줄이기: 내 위치·검색 하이라이트·비컨의 반복 맥동을 멈춘다(정지된 링은 남는다). 네이티브 HTML 과 같다.
    '@media (prefers-reduced-motion: reduce) { .mfz-me-ring, .mfz-hl-ping, .mfz-beacon-pulse { animation: none !important; } }';
  document.head.appendChild(style);
}

const HL_STYLE_ID = '__mfz_hl_style__';
// 검색 하이라이트 링/핑 키프레임·클래스 주입(buildMarkerHtml 의 class 가 참조). 네이티브 <style> 와 동일.
function ensureHighlightStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(HL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HL_STYLE_ID;
  style.textContent =
    '@keyframes mfzHlPing { 0% { transform: translate(-50%,-50%) scale(0.7); opacity:0.85; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity:0; } }' +
    '.mfz-hl-static { position:absolute; top:50%; left:50%; width:38px; height:38px; transform:translate(-50%,-50%); border-radius:50%; border:3px solid #2563eb; box-shadow:0 0 0 3px rgba(37,99,235,0.22); box-sizing:border-box; }' +
    '.mfz-hl-ping { position:absolute; top:50%; left:50%; width:30px; height:30px; transform:translate(-50%,-50%); border-radius:50%; border:3px solid #2563eb; box-sizing:border-box; animation: mfzHlPing 1.5s ease-out infinite; }';
  document.head.appendChild(style);
}

const BEACON_STYLE_ID = '__mfz_beacon_style__';
// 검색한 '새 위치' 비컨 핀 + 펄스 키프레임 주입(네이티브 HTML 의 .mfz-beacon 과 동일).
function ensureBeaconStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BEACON_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BEACON_STYLE_ID;
  style.textContent =
    '@keyframes mfzBeaconPulse { 0% { transform: translateX(-50%) scale(0.6); opacity:0.65; } 100% { transform: translateX(-50%) scale(2.6); opacity:0; } }' +
    '.mfz-beacon { position:relative; width:30px; height:42px; pointer-events:none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); }' +
    '.mfz-beacon-pulse { position:absolute; left:50%; bottom:2px; width:14px; height:14px; border-radius:50%; background:rgba(37,99,235,0.4); transform:translateX(-50%); animation: mfzBeaconPulse 1.5s ease-out infinite; }';
  document.head.appendChild(style);
}
const BEACON_HTML =
  '<div class="mfz-beacon"><div class="mfz-beacon-pulse"></div><svg width="30" height="42" viewBox="0 0 30 42"><path d="M15 1 C7.3 1 1 7.3 1 15 C1 25.5 15 41 15 41 C15 41 29 25.5 29 15 C29 7.3 22.7 1 15 1 Z" fill="#2563eb" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg></div>';

type Overlay = { setMap: (m: unknown | null) => void };
type CustomOverlayCtor = new (opts: {
  position: unknown;
  content: Element;
  map: unknown;
  xAnchor?: number;
  yAnchor?: number;
  zIndex?: number;
}) => Overlay;
type LatLngBounds = { extend: (latlng: unknown) => void };
type MapProjection = {
  containerPointFromCoords: (latlng: unknown) => { x: number; y: number };
  coordsFromContainerPoint: (point: unknown) => { getLat: () => number; getLng: () => number };
};
type KakaoMap = {
  setCenter: (latlng: unknown) => void;
  panTo: (latlng: unknown) => void;
  setLevel: (level: number, opts?: { animate?: { duration: number }; anchor?: unknown }) => void;
  getLevel: () => number;
  getCenter: () => { getLat: () => number; getLng: () => number };
  setBounds: (bounds: LatLngBounds, pt?: number, pr?: number, pb?: number, pl?: number) => void;
  setDraggable: (v: boolean) => void;
  setZoomable: (v: boolean) => void;
  getProjection: () => MapProjection;
  setMapTypeId: (mapTypeId: unknown) => void;
  relayout: () => void;
};
type MapTypeIdEnum = {
  ROADMAP: unknown;
  SKYVIEW: unknown;
  HYBRID: unknown;
};
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    LatLngBounds: new () => LatLngBounds;
    MapTypeId: MapTypeIdEnum;
    Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMap;
    Marker: new (options: { position: unknown; map: unknown; title?: string }) => Overlay;
    CustomOverlay: CustomOverlayCtor;
    Polygon: new (options: {
      path: unknown[] | unknown[][];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
    }) => Overlay;
    Circle: new (options: Record<string, unknown>) => Overlay;
    Polyline: new (options: {
      path: unknown[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
    }) => Overlay;
    event: {
      addListener: (target: unknown, type: string, handler: () => void) => void;
      removeListener: (target: unknown, type: string, handler: () => void) => void;
    };
  };
};

function getKakao(): KakaoGlobal | null {
  const w = window as unknown as { kakao?: KakaoGlobal };
  return w.kakao ?? null;
}

function loadKakaoSdk(appkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('no window/document'));
      return;
    }
    const existing = getKakao();
    if (existing?.maps?.load) {
      existing.maps.load(() => resolve());
      return;
    }
    const prior = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (prior) {
      prior.addEventListener('load', () => {
        const k = getKakao();
        if (k?.maps?.load) k.maps.load(() => resolve());
        else reject(new Error('kakao not available after load'));
      });
      prior.addEventListener('error', () => reject(new Error('script error')));
      return;
    }
    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    // libraries=services 필수 — 이 스크립트는 id 로 싱글톤이라, services 없이 먼저 로드되면
    // 같은 SDK 를 공유하는 장소검색(useKakaoPlaceSearch.web)에서 kakao.maps.services 가 undefined 가 됨.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => {
      const k = getKakao();
      if (k?.maps?.load) k.maps.load(() => resolve());
      else reject(new Error('kakao not available after load'));
    };
    script.onerror = () => reject(new Error('script error'));
    document.head.appendChild(script);
  });
}

// 외부('내 위치' 버튼·탭 포커스 동기화)에서 지도를 명령형으로 제어하기 위한 핸들 — native 변형과 동일.
export interface KakaoMapHandle {
  recenter: (target?: { lat: number; lng: number }) => void;
  // animate: 카메라를 움직여 옮긴다(기본은 바로). 탭 포커스 동기화처럼 보이기 전 맞춤은 바로.
  setView: (view: { lat: number; lng: number; level: number }, opts?: { animate?: boolean }) => void;
}

export const KakaoMapWebView = forwardRef<KakaoMapHandle, Props>(
  function KakaoMapWebView(
    {
      markers,
      center,
      initialLevel,
      displayMode = 'markers',
      showBoundary = false,
      baseMapType = 'roadmap',
      myLocation = null,
      beacon = null,
      route,
      paths,
      circle = null,
      startPoint = null,
      fitToMarkers = false,
      fitExtra,
      fitPadding,
      fitKey,
      hideScale = false,
      compactPins = false,
      pinScale = CARD_PIN_SCALE,
      interactive = true,
      onMarkerPress,
      onLongPress,
      onMapPress,
      onViewChange,
      holdCenterOnResize = false,
    }: Props,
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  // 사용자가 지도를 한 번이라도 끌었는가 — 크기 변화 때 center 로 되돌릴지 정한다.
  const userMovedRef = useRef(false);
  // 카드 맞춤(fitTight) 중 — 그 사이 zoom_changed 는 onViewChange 로 보내지 않는다.
  const fittingRef = useRef(false);
  const overlaysRef = useRef<Overlay[]>([]);
  const myLocOverlayRef = useRef<Overlay | null>(null);
  const beaconOverlayRef = useRef<Overlay | null>(null);
  const routeLineRef = useRef<Overlay | null>(null);
  const pathLinesRef = useRef<Overlay[]>([]);
  const circleRef = useRef<Overlay | null>(null);
  const startRef = useRef<Overlay | null>(null);
  const boundaryOverlaysRef = useRef<Overlay[]>([]);
  // KDE 히트맵 — 캔버스 div + h337 인스턴스. redraw 클로저가 최신 모드/점을 읽도록 ref 미러.
  const heatRef = useRef<HTMLDivElement | null>(null);
  const heatInstanceRef = useRef<ReturnType<typeof h337.create> | null>(null);
  const heatScheduleRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<KakaoMapMarker[] | null>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const closeGroup = useCallback(() => setActiveGroup(null), []);
  const onMarkerPressRef = useRef(onMarkerPress);
  onMarkerPressRef.current = onMarkerPress;
  const pickFromGroup = useCallback((id: string) => onMarkerPressRef.current?.(id), []);
  // 핀을 누른 시각 — 카카오 지도 click 이 핀 click 과 함께 와도 빈 곳 누르기로 치지 않게.
  const pinTapAtRef = useRef(0);
  // 길게 누르기가 터졌는가 — 다음 손가락이 닿을 때까지. 그 손을 떼며 생기는 지도 click 은 빈 곳 누르기가 아니다.
  const longPressedRef = useRef(false);
  const onMapPressRef = useRef(onMapPress);
  onMapPressRef.current = onMapPress;

  // 명령형 복구 — '내 위치' 버튼이 드래그된 지도를 다시 내 위치로 끌어온다.
  useImperativeHandle(
    ref,
    () => ({
      recenter: (target) => {
        const m = mapRef.current;
        const k = getKakao();
        if (!m || !k) return;
        const t = target ?? myLocation ?? center ?? DEFAULT_CENTER;
        if (m.getLevel() > 6) m.setLevel(5);
        m.panTo(new k.maps.LatLng(t.lat, t.lng));
      },
      setView: (view, opts) => {
        const m = mapRef.current;
        const k = getKakao();
        if (!m || !k) return;
        if (!opts?.animate) {
          m.setLevel(view.level);
          m.setCenter(new k.maps.LatLng(view.lat, view.lng));
          return;
        }
        moveCamera(m, k, m.getProjection().containerPointFromCoords(new k.maps.LatLng(view.lat, view.lng)), view.level, true);
      },
    }),
    [myLocation, center],
  );

  // 동일 좌표 마커는 그룹으로 묶어 첫 마커만 표시 + "+N" 뱃지. 좌표 무손실.
  const markerGroups = useMemo(() => groupSameLocationMarkers(markers), [markers]);

  // 히트맵 점 — 군집 크기를 value 로 실어 밀도 가중. 모드/점은 ref 로도 미러(생성 1회 effect 의 redraw 클로저용).
  const heatPoints = useMemo(
    () => markerGroups.map((g) => ({ lat: g[0].lat, lng: g[0].lng, value: g.length })),
    [markerGroups],
  );
  const heatPointsRef = useRef(heatPoints);
  heatPointsRef.current = heatPoints;
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;

  // 지도 인스턴스 1회 생성. 초기 center 는 props.center > myLocation > DEFAULT.
  useEffect(() => {
    if (!kakaoJsKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoSdk(kakaoJsKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const k = getKakao();
        if (!k) {
          setError('Kakao SDK 로드 실패');
          return;
        }
        const c = center ?? myLocation ?? DEFAULT_CENTER;
        const map = new k.maps.Map(containerRef.current, {
          center: new k.maps.LatLng(c.lat, c.lng),
          level: initialLevel ?? 8,
        });
        mapRef.current = map;
        k.maps.event.addListener(map, 'dragstart', () => {
          userMovedRef.current = true;
        });
        // 휠·두 손가락 줌·두 번 탭 줌도 사용자가 손댄 것이다(카카오 zoom_start 는 코드로 줌할 때도 와서 못 쓴다).
        const markMoved = (e: Event) => {
          if (e.type !== 'touchstart' || (e as TouchEvent).touches.length >= 2) userMovedRef.current = true;
        };
        containerRef.current.addEventListener('wheel', markMoved, { passive: true });
        containerRef.current.addEventListener('touchstart', markMoved, { passive: true });
        containerRef.current.addEventListener('dblclick', markMoved);
        // 사용자가 직접 끌거나 줌한 뒤에만 현재 뷰 보고 — 지도 생성 시 자동 발화하는 idle 로
        // 보고하면 안 보이는 탭의 지도가 초기 위치로 값을 덮어쓴다. 상위가 기억해 재마운트 시 복원.
        if (onViewChange) {
          const report = () => {
            if (fittingRef.current) return;
            const ctr = map.getCenter();
            onViewChange({ lat: ctr.getLat(), lng: ctr.getLng(), level: map.getLevel() });
          };
          k.maps.event.addListener(map, 'dragend', report);
          k.maps.event.addListener(map, 'zoom_changed', report);
        }
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // 초기 center로만 생성. 후속 변경은 아래 useEffect 가 in-place 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoJsKey]);

  // mount 후 center prop 변경 — map.setCenter 로 in-place 갱신 (init useEffect 가 무시하던 회로 차단).
  // fitToMarkers 모드에선 아래 setBounds 가 프레이밍을 잡으므로 center 추종 생략.
  useEffect(() => {
    if (!ready || !mapRef.current || !center || fitToMarkers) return;
    const k = getKakao();
    if (!k) return;
    mapRef.current.setCenter(new k.maps.LatLng(center.lat, center.lng));
  }, [ready, center?.lat, center?.lng, fitToMarkers]);

  // fitToMarkers — 모든 마커가 한 화면에 들어오도록 setBounds. 마커가 비동기로 도착(현장 좌표
  // 로드)하면 다시 맞춤. 1개면 setBounds 가 최대 줌으로 튀어 부적절 → 센터 + 적당한 level.
  const centerRef = useRef(center);
  centerRef.current = center;
  const fitToMarkersRef = useRef(fitToMarkers);
  fitToMarkersRef.current = fitToMarkers;
  const holdCenterRef = useRef(holdCenterOnResize);
  holdCenterRef.current = holdCenterOnResize;
  // 첫 맞춤(마운트·첫 좌표)은 바로, 그 뒤 바뀔 때는 카메라를 움직여 옮긴다.
  const fittedRef = useRef(false);
  // 첫 맞춤 뒤 한 틱이 지나야 카메라를 움직인다 — 같은 틱에 이어 오는 맞춤(여백·추가 점)은 첫 맞춤의 일부라 바로.
  const animOkRef = useRef(false);
  const fitRef = useRef<(opts?: { auto?: boolean }) => void>(() => {});
  fitRef.current = (opts) => {
    if (!mapRef.current || !fitToMarkers || markers.length === 0) return;
    const k = getKakao();
    if (!k) return;
    // fitKey 모드: 사용자가 손댄 구도는 자동으로 덮지 않는다.
    if (fitKey != null && fittedRef.current && userMovedRef.current) return;
    const pts: { lat: number; lng: number }[] = [...markers, ...(fitExtra ?? [])];
    if (compactPins) {
      fitTight(mapRef.current, k, circle ? [...pts, ...circleExtremes(circle)] : pts);
      return;
    }
    const animate = fittedRef.current && animOkRef.current && !opts?.auto;
    if (!fittedRef.current) setTimeout(() => (animOkRef.current = true), 0);
    fittedRef.current = true;
    if (animate) {
      const map = mapRef.current;
      const proj = map.getProjection();
      const el = containerRef.current;
      const w = el?.clientWidth ?? 0;
      const h = el?.clientHeight ?? 0;
      const pad: [number, number, number, number] =
        fitPadding ?? (h > 0 && h < 200 ? [48, 24, 12, 24] : [40, 40, 56, 40]);
      const cam = fitCamera(
        pts.map((p) => proj.containerPointFromCoords(new k.maps.LatLng(p.lat, p.lng))),
        map.getLevel(),
        w,
        h,
        pad,
      );
      if (cam) {
        moveCamera(map, k, cam.center, cam.level, true);
        return;
      }
    }
    if (pts.length === 1) {
      mapRef.current.setCenter(new k.maps.LatLng(pts[0].lat, pts[0].lng));
      mapRef.current.setLevel(5);
      return;
    }
    const bounds = new k.maps.LatLngBounds();
    pts.forEach((m) => bounds.extend(new k.maps.LatLng(m.lat, m.lng)));
    // 정적 지도 카드(120·132)는 기본 여백(위아래 96)이면 남는 높이가 30여 px 라 몇 배 멀리 보인다 —
    // 2차 핀은 끝이 좌표라 위로만 44 가 솟으므로 위 48·아래 12 로 줄인다.
    const h = containerRef.current?.clientHeight ?? 0;
    if (fitPadding) mapRef.current.setBounds(bounds, ...fitPadding);
    else if (h > 0 && h < 200) mapRef.current.setBounds(bounds, 48, 24, 12, 24);
    else mapRef.current.setBounds(bounds, 40, 40, 56, 40);
  };
  // 카메라 옮기기. 레벨이 같으면 panTo, 다르면 기준점(zoomAnchor)을 잡아 줌 하나로 — 줌과 이동을 따로 하면
  // 두 애니메이션이 겹쳐 흔들린다. target 은 지금 레벨 컨테이너 px.
  // 카메라가 움직이는 중(duration.slow 안)에 또 요청이 오면 겹치지 않게 마지막 구도로 바로 옮긴다.
  const camUntilRef = useRef(0);
  const moveCamera = (map: KakaoMap, k: KakaoGlobal, target: Pt, level: number, animate: boolean) => {
    const proj = map.getProjection();
    const t = proj.coordsFromContainerPoint(new k.maps.Point(target.x, target.y));
    const cur = map.getLevel();
    if (!animate || reducedMotion() || Date.now() < camUntilRef.current) {
      map.setLevel(level);
      map.setCenter(t);
      return;
    }
    camUntilRef.current = Date.now() + duration.slow;
    if (cur === level) {
      map.panTo(t);
      return;
    }
    const el = containerRef.current;
    const c = { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 };
    const a = zoomAnchor(c, target, Math.pow(2, cur - level));
    map.setLevel(level, {
      animate: { duration: duration.slow },
      anchor: proj.coordsFromContainerPoint(new k.maps.Point(a.x, a.y)),
    });
  };
  // 정적 카드 맞춤: 가운데로 옮겨 지금 레벨에서 점들의 화면 폭을 재고, 여백 안에 들어가는 가장 가까운 레벨로 바꾼 뒤
  // 점들의 화면 범위 가운데가 여백 안쪽 가운데에 오게 중심을 옮긴다.
  const fitTight = (map: KakaoMap, k: KakaoGlobal, pts: { lat: number; lng: number }[]) => {
    const el = containerRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const [pt, pr, pb0, pl] = fitPadding ?? CARD_FIT_PADDING;
    const pb = fitExtra?.length ? Math.max(pb0, CARD_DOT_PAD) : pb0;
    const boxW = w - pl - pr;
    const boxH = h - pt - pb;
    if (boxW <= 0 || boxH <= 0) return; // 아직 레이아웃 전 — 크기가 잡히면 ResizeObserver 가 다시 부른다
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    map.setCenter(new k.maps.LatLng((Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2));
    const extent = () => {
      const proj = map.getProjection();
      const xy = pts.map((p) => proj.containerPointFromCoords(new k.maps.LatLng(p.lat, p.lng)));
      const xs = xy.map((q) => q.x);
      const ys = xy.map((q) => q.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const e0 = extent();
    fittingRef.current = true; // 맞추는 동안의 zoom_changed 는 사용자 구도가 아니다
    map.setLevel(closestFitLevel(e0.x1 - e0.x0, e0.y1 - e0.y0, map.getLevel(), boxW, boxH));
    const e = extent();
    const dx = (e.x0 + e.x1) / 2 - (pl + boxW / 2);
    const dy = (e.y0 + e.y1) / 2 - (pt + boxH / 2);
    map.setCenter(map.getProjection().coordsFromContainerPoint(new k.maps.Point(w / 2 + dx, h / 2 + dy)));
    fittingRef.current = false;
  };
  useEffect(() => {
    if (!ready) return;
    fitRef.current();
    // fitKey 가 있으면 마커 배열이 아니라 키가 바뀔 때만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey ?? markers, fitToMarkers, fitPadding?.join(','), JSON.stringify(fitExtra ?? []), compactPins && circle ? `${circle.lat},${circle.lng},${circle.radius}` : '']);

  // 컨테이너 크기가 바뀌면(첫 레이아웃이 지도 생성보다 늦은 작은 카드 등) 카카오 지도는 스스로 다시 재지
  // 않아 중심이 어긋난다(MapPreviewCard 에서 핀이 카드 아래로 밀려 실측). relayout 후 다시 맞춘다.
  useEffect(() => {
    if (!ready || !mapRef.current || !containerRef.current) return;
    const map = mapRef.current;
    let last = '';
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      const key = r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '';
      if (key === last) return;
      last = key;
      map.relayout();
      // 크기 변화로 다시 맞출 때는 바로(움직이는 카메라는 크기 변화와 겹치면 어긋난다).
      fitRef.current({ auto: true });
      // holdCenterOnResize: relayout 이 왼쪽 위를 붙잡아 중심이 어긋난다 — 사용자가 끌기 전이면 center 로 다시 맞춘다.
      const c = centerRef.current;
      const k = getKakao();
      if (holdCenterRef.current && !fitToMarkersRef.current && !userMovedRef.current && c && k) {
        map.setCenter(new k.maps.LatLng(c.lat, c.lng));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready]);

  // 길게 누르기(4-3 지도에서 위치 고르기) — 600ms 동안 10px 안에 머물면 그 지점 좌표. 네이티브 HTML 과 같은 규칙.
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  useEffect(() => {
    const root = containerRef.current;
    if (!ready || !root || !interactive) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0;
    let sy = 0;
    // 길게 누른 뒤 손을 떼며 생기는 첫 click 은 핀·지도 누르기로 치지 않는다(네이티브 HTML 과 같은 규칙).
    let swallow = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const start = (x: number, y: number) => {
      cancel();
      swallow = false;
      longPressedRef.current = false;
      if (!onLongPressRef.current) return;
      sx = x;
      sy = y;
      timer = setTimeout(() => {
        timer = null;
        swallow = true;
        longPressedRef.current = true;
        const k = getKakao();
        const map = mapRef.current;
        if (!k || !map) return;
        const rect = root.getBoundingClientRect();
        const ll = map.getProjection().coordsFromContainerPoint(new k.maps.Point(sx - rect.left, sy - rect.top));
        onLongPressRef.current?.({ lat: ll.getLat(), lng: ll.getLng() });
      }, 600);
    };
    const move = (x: number, y: number) => {
      if (timer && (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10)) cancel();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) start(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY);
      else cancel();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onClick = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };
    // 길게 누르면 뜨는 브라우저 메뉴를 막는다.
    const onContextMenu = (e: Event) => e.preventDefault();
    // 캡처 단계 — 카카오 지도가 드래그 처리로 이벤트를 멈춰도 받는다.
    const opts = { capture: true, passive: true } as const;
    const activeOpts = { capture: true } as const;
    root.addEventListener('click', onClick, activeOpts);
    root.addEventListener('contextmenu', onContextMenu, activeOpts);
    root.addEventListener('mousedown', onMouseDown, opts);
    root.addEventListener('mousemove', onMouseMove, opts);
    root.addEventListener('mouseup', cancel, opts);
    root.addEventListener('mouseleave', cancel, opts);
    root.addEventListener('touchstart', onTouchStart, opts);
    root.addEventListener('touchmove', onTouchMove, opts);
    root.addEventListener('touchend', cancel, opts);
    root.addEventListener('touchcancel', cancel, opts);
    return () => {
      cancel();
      root.removeEventListener('click', onClick, activeOpts);
      root.removeEventListener('contextmenu', onContextMenu, activeOpts);
      root.removeEventListener('mousedown', onMouseDown, opts);
      root.removeEventListener('mousemove', onMouseMove, opts);
      root.removeEventListener('mouseup', cancel, opts);
      root.removeEventListener('mouseleave', cancel, opts);
      root.removeEventListener('touchstart', onTouchStart, opts);
      root.removeEventListener('touchmove', onTouchMove, opts);
      root.removeEventListener('touchend', cancel, opts);
      root.removeEventListener('touchcancel', cancel, opts);
    };
  }, [ready, interactive]);

  // 빈 곳 누르기 — 핀 click 과 지도 click 의 순서가 일정하지 않아 잠깐 기다렸다가, 핀을 누르지 않았고
  // 길게 누르기 직후도 아닐 때만 보낸다(네이티브 HTML 과 같은 규칙).
  const hasMapPress = !!onMapPress;
  useEffect(() => {
    const k = getKakao();
    const map = mapRef.current;
    if (!ready || !k || !map || !interactive || !hasMapPress) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onClick = () => {
      if (longPressedRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (Date.now() - pinTapAtRef.current > MAP_PRESS_PIN_GAP_MS) onMapPressRef.current?.();
      }, 50);
    };
    k.maps.event.addListener(map, 'click', onClick);
    return () => {
      if (timer) clearTimeout(timer);
      k.maps.event.removeListener(map, 'click', onClick);
    };
  }, [ready, interactive, hasMapPress]);

  // 정적 위치도(figure) — 드래그/줌 차단. BottomSheet pan 충돌 회피 + 보고서 그림용.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setDraggable(interactive);
    mapRef.current.setZoomable(interactive);
    if (!hideScale) return;
    // 정적 지도 카드(hideScale)에는 축척 막대를 숨긴다(카카오 로고는 남긴다). 축척은 줌이 바뀔 때마다 다시 그려진다.
    const k = getKakao();
    const root = containerRef.current;
    if (!k || !root) return;
    const map = mapRef.current;
    const hide = () => hideKakaoScale(root);
    hide();
    k.maps.event.addListener(map, 'idle', hide);
    return () => k.maps.event.removeListener(map, 'idle', hide);
  }, [ready, interactive, hideScale]);

  // 베이스 지도 종류(일반/위성/하이브리드) — setMapTypeId 로 베이스 타일만 교체.
  // 마커·히트맵 캔버스·경계 폴리곤은 위에 그대로 유지된다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    const t =
      baseMapType === 'skyview'
        ? k.maps.MapTypeId.SKYVIEW
        : baseMapType === 'hybrid'
          ? k.maps.MapTypeId.HYBRID
          : k.maps.MapTypeId.ROADMAP;
    mapRef.current.setMapTypeId(t);
  }, [ready, baseMapType]);

  // myLocation 오버레이 — ready 후 한 번 / myLocation 변경 시 재배치.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    myLocOverlayRef.current?.setMap(null);
    myLocOverlayRef.current = null;
    if (!myLocation) return;
    ensureMyLocPulseStyle();
    const content = document.createElement('div');
    content.style.cssText = 'position:relative;width:22px;height:22px;pointer-events:none;';
    content.innerHTML =
      '<div style="position:absolute;top:50%;left:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#2563eb;opacity:0.35;" class="mfz-me-ring"></div>' +
      '<div style="position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>';
    const overlay = new (k.maps as unknown as {
      CustomOverlay: new (opts: {
        position: unknown;
        content: Element;
        map: unknown;
        xAnchor?: number;
        yAnchor?: number;
        zIndex?: number;
      }) => Overlay;
    }).CustomOverlay({
      position: new k.maps.LatLng(myLocation.lat, myLocation.lng),
      content,
      map: mapRef.current,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 5,
    });
    // 내 위치 점은 누를 것이 아니다 — 카카오가 씌우는 바깥 상자가 그 아래 핀 누르기를 가로채지 않게.
    if (content.parentElement) content.parentElement.style.pointerEvents = 'none';
    myLocOverlayRef.current = overlay;
  }, [ready, myLocation]);

  // 검색한 '새 위치' 비컨 오버레이 — ready 후 / beacon 변경 시 재배치.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    beaconOverlayRef.current?.setMap(null);
    beaconOverlayRef.current = null;
    if (!beacon) return;
    ensureBeaconStyle();
    const content = document.createElement('div');
    content.innerHTML = BEACON_HTML;
    beaconOverlayRef.current = new k.maps.CustomOverlay({
      position: new k.maps.LatLng(beacon.lat, beacon.lng),
      content,
      map: mapRef.current,
      xAnchor: 0.5,
      yAnchor: 1,
      zIndex: 6,
    });
  }, [ready, beacon?.lat, beacon?.lng]);

  // 외근 동선 경로선 — 마커 레이어와 독립이라 표시 방식(markers/heatmap/choropleth) 전환에도 남는다.
  // route 배열 identity 로 재생성 — 상위(MapDashboard)가 useMemo 로 안정화해 넘긴다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    routeLineRef.current?.setMap(null);
    routeLineRef.current = null;
    if (!route || route.length < 2) return;
    const line = new k.maps.Polyline({
      path: route.map((p) => new k.maps.LatLng(p.lat, p.lng)),
      strokeWeight: 4,
      strokeColor: colors.primary,
      strokeOpacity: 0.7,
      strokeStyle: 'shortdash',
    });
    line.setMap(mapRef.current);
    routeLineRef.current = line;
  }, [ready, route]);

  // 2차 경로선.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    pathLinesRef.current.forEach((l) => l.setMap(null));
    pathLinesRef.current = [];
    (paths ?? []).forEach((p) => {
      if (p.points.length < 2) return;
      const line = new k.maps.Polyline({
        path: p.points.map((q) => new k.maps.LatLng(q.lat, q.lng)),
        ...pathStyle(p),
      });
      line.setMap(mapRef.current);
      pathLinesRef.current.push(line);
    });
  }, [ready, paths]);

  // 2차 GPS 오차 원.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    if (!circle) return;
    const c = new k.maps.Circle({
      ...(circle.tone === 'brand' ? ACCURACY_CIRCLE_STYLE_BRAND : ACCURACY_CIRCLE_STYLE),
      center: new k.maps.LatLng(circle.lat, circle.lng),
      radius: circle.radius,
    });
    c.setMap(mapRef.current);
    circleRef.current = c;
  }, [ready, circle?.lat, circle?.lng, circle?.radius, circle?.tone]);

  // 2차 출발 위치.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    startRef.current?.setMap(null);
    startRef.current = null;
    if (!startPoint) return;
    const content = document.createElement('div');
    content.innerHTML = START_POINT_HTML;
    startRef.current = new k.maps.CustomOverlay({
      position: new k.maps.LatLng(startPoint.lat, startPoint.lng),
      content,
      map: mapRef.current,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 2,
    });
  }, [ready, startPoint?.lat, startPoint?.lng]);

  // 단계구분도 카운트 집계 — 폴리곤 effect 와 분리해, 경계만 토글(markers 불변)할 땐 재집계 생략.
  // 렌더 단계라 throw 가 화면을 깨므로 try 로 감싸 실패 시 null(채색 생략)로 폴백.
  const regionCounts = useMemo(() => {
    if (displayMode !== 'choropleth') return null;
    try {
      return aggregateByRegion(
        markers.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })),
        loadSigunguGeoJson(),
      );
    } catch (e) {
      console.error('단계구분도 집계 실패', e);
      return null;
    }
  }, [displayMode, markers]);

  // 행정구역 경계 + 단계구분도 렌더링 (공통 폴리곤)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;

    // 기존 경계 제거
    boundaryOverlaysRef.current.forEach((p) => p.setMap(null));
    boundaryOverlaysRef.current = [];

    const isChoropleth = displayMode === 'choropleth';
    if (!showBoundary && !isChoropleth) return;

    try {
      const fc = loadSigunguGeoJson();
      const counts = regionCounts; // 절대 건수 구간으로 채색(데이터 양 무관)

      fc.features.forEach((featureItem) => {
        const geom = featureItem.geometry;
        const polygons =
          geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

        const regionCount = counts?.get(featureItem.properties.code) ?? 0;
        const choroplethOpacity = counts ? fillOpacityForCount(regionCount) : 0;

        polygons.forEach((polygon) => {
          const outerRing = polygon[0];
          if (!outerRing) return;
          const path = outerRing.map(
            ([lng, lat]) => new k.maps.LatLng(lat, lng),
          );
          const poly = new k.maps.Polygon({
            path,
            strokeWeight: showBoundary ? 1.5 : 0.8,
            strokeColor: '#004c80',
            strokeOpacity: showBoundary ? 0.6 : 0.3,
            strokeStyle: 'solid',
            fillColor: CHOROPLETH_COLOR,
            fillOpacity: isChoropleth ? choroplethOpacity : 0,
          });
          poly.setMap(mapRef.current);
          boundaryOverlaysRef.current.push(poly);
        });
      });
    } catch (e) {
      console.error('경계/단계구분도 로드 실패', e);
    }
  }, [ready, showBoundary, displayMode, regionCounts]);

  // 오버레이 갱신 (displayMode·markers에 반응) + 줌 변화마다 재클러스터/라벨 토글.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    const map = mapRef.current;
    ensureHighlightStyle(); // buildMarkerHtml 의 .mfz-hl-* 클래스가 참조하는 키프레임 주입(1회)

    // KWCAG 1.4.1 색+형상+라벨. 픽셀 거리로 묶고 카운트 뱃지로 다중임을 표시 — head 좌표 무손실.
    // choropleth 는 구역 색만 표시하므로 마커를 그리지 않는다. 라벨은 줌인(레벨 ≤ 임계) 단일 마커만.
    const render = () => {
      // 기존 마커 오버레이 제거 (히트맵은 아래 캔버스 effect 가 별도 처리)
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
      if (displayMode !== 'markers') return;
      const proj = map.getProjection();
      const showLabel = map.getLevel() <= LABEL_MAX_LEVEL;
      // 2차 핀: 조치 상태 핀(순번·선택·이름표 없음)은 화면 거리로 묶고 넓은 줌에서 줄인다.
      // 순번·선택 핀은 하나하나가 의미라 묶지 않고 그 위에 그린다(네이티브 renderMarkers 와 같은 규칙).
      const legacy: KakaoMapMarker[] = [];
      const loose: KakaoMapMarker[] = [];
      // 카드 핀은 0.75배, 넓은 줌에서는 전체 지도처럼 더 줄인다(0.6).
      const cardScale = Math.min(pinScale, pinScaleForLevel(map.getLevel()));
      const addPin = (m: KakaoMapMarker, html: string, zIndex: number, onClick: () => void) => {
        const content = document.createElement('div');
        content.innerHTML = html;
        const box = content.firstChild as HTMLElement | null;
        box?.addEventListener('click', () => {
          pinTapAtRef.current = Date.now();
          onClick();
        });
        overlaysRef.current.push(
          new k.maps.CustomOverlay({
            position: new k.maps.LatLng(m.lat, m.lng),
            content,
            map,
            xAnchor: 0.5,
            yAnchor: PIN_TIP_Y_RATIO,
            zIndex,
          }),
        );
        // 줄이거나 배지를 단 핀(wrapPinHtml)은 32×44 상자가 그대로라 빈 자리가 아래 핀을 가린다 — 상자·content·카카오
        // 감싸개 모두 손가락을 통과시키고, 그려진 핀(pointer-events:auto)만 받는다(클릭은 상자 리스너까지 올라온다).
        if (box?.style.pointerEvents === 'none') {
          content.style.pointerEvents = 'none';
          if (content.parentElement) content.parentElement.style.pointerEvents = 'none';
        }
      };
      markers.forEach((m) => {
        if (!m.pin) legacy.push(m);
        else if (isClusterablePin(m)) loose.push(m);
        else
          addPin(
            m,
            compactPins && m.pin !== 'group'
              ? wrapPinHtml(buildPinHtml(m.pin, m.order ?? null, null, m.nameTag ?? null), cardScale, 1)
              : buildPinHtml(m.pin, m.order ?? null, m.selected ? m.selectedSize ?? 'sm' : null, m.nameTag ?? null),
            m.selected ? 5 : 4,
            () => onMarkerPress?.(m.id),
          );
      });
      const scale = compactPins ? cardScale : pinScaleForLevel(map.getLevel());
      // 급한 상태가 앞에 오게 — 묶음의 대표(첫 핀)가 조치 전 > 조치 중 > 조치 완료 순.
      const byPriority = [...loose].sort(
        (a, b) => (CLUSTER_PIN_PRIORITY[a.pin!] ?? 9) - (CLUSTER_PIN_PRIORITY[b.pin!] ?? 9),
      );
      clusterByPixel(byPriority, proj, (lat, lng) => new k.maps.LatLng(lat, lng), PIN_CLUSTER_PX).forEach((cl) => {
        const head = cl.head;
        addPin(head, wrapPinHtml(buildPinHtml(head.pin!), scale, cl.count), 3, () => {
          if (cl.count === 1) onMarkerPress?.(head.id);
          else {
            const idSet = new Set(cl.ids);
            setActiveGroup(byPriority.filter((m) => idSet.has(m.id)));
          }
        });
      });
      const clusters = clusterByPixel(
        legacy,
        proj,
        (lat, lng) => new k.maps.LatLng(lat, lng),
      );
      clusters.forEach((cl) => {
        const content = document.createElement('div');
        content.innerHTML = buildMarkerHtml(
          cl.head,
          cl.count,
          showLabel && cl.count === 1,
          cl.minOrder,
        );
        const child = content.firstChild as HTMLElement | null;
        if (child) {
          child.addEventListener('click', () => {
            pinTapAtRef.current = Date.now();
            if (cl.count === 1) {
              onMarkerPress?.(cl.head.id);
            } else {
              const idSet = new Set(cl.ids);
              setActiveGroup(markers.filter((m) => idSet.has(m.id)));
            }
          });
        }
        const overlay = new k.maps.CustomOverlay({
          position: new k.maps.LatLng(cl.head.lat, cl.head.lng),
          content,
          map,
          // anchor 박스 = SVG 26×26. 중앙(0.5, 0.5)이 좌표에 정확히 정렬되어 줌 무관 정확.
          xAnchor: 0.5,
          yAnchor: 0.5,
        });
        overlaysRef.current.push(overlay);
      });
    };

    render();
    // pan 은 픽셀 거리 불변이라 재계산 불필요 — 줌에서만 다시 묶고 라벨을 토글.
    k.maps.event.addListener(map, 'zoom_changed', render);
    return () => {
      k.maps.event.removeListener(map, 'zoom_changed', render);
    };
  }, [markers, ready, onMarkerPress, displayMode, compactPins, pinScale]);

  // 히트맵 인스턴스 1회 생성 + pan/zoom redraw 리스너. redraw 클로저는 ref 로 최신 모드/점을 읽는다.
  useEffect(() => {
    if (!ready || !mapRef.current || !heatRef.current) return;
    const k = getKakao();
    if (!k) return;
    const map = mapRef.current;
    const heat = h337.create({
      container: heatRef.current,
      radius: HEAT_CONFIG.radius,
      maxOpacity: HEAT_CONFIG.maxOpacity,
      minOpacity: HEAT_CONFIG.minOpacity,
      blur: HEAT_CONFIG.blur,
      gradient: HEAT_GRADIENT,
    });
    heatInstanceRef.current = heat;

    let pending = false;
    let rafId = 0;
    let zooming = false; // 줌 애니메이션 진행 중 — 전환 프레임마다 재계산하지 않음
    const redraw = () => {
      if (displayModeRef.current !== 'heatmap' || !mapRef.current) return;
      const el = heatRef.current;
      if (!el) return;
      const proj = map.getProjection();
      // 뷰포트 밖 점은 커널 반경(R) 밖이라 화면 픽셀에 기여하지 못함 → 제외.
      // (화면 밖 점이 h337 colorize 영역을 캔버스 전체로 키우던 비대 차단 — 줌인 pan 비용 감소)
      const W = el.clientWidth;
      const H = el.clientHeight;
      // 극단 줌아웃에선 반경 축소(heatRadiusForLevel) — 커널이 도시보다 커져 '경계 밖
      // 빨간 원'으로 수렴하는 것 완화. configure({radius})는 h337 store 에 반영되지
      // 않으므로 점별 radius 로 전달.
      const R = heatRadiusForLevel(map.getLevel());
      const data: { x: number; y: number; value: number; radius: number }[] = [];
      for (const p of heatPointsRef.current) {
        const pt = proj.containerPointFromCoords(new k.maps.LatLng(p.lat, p.lng));
        if (pt.x < -R || pt.x > W + R || pt.y < -R || pt.y > H + R) continue;
        data.push({ x: Math.round(pt.x), y: Math.round(pt.y), value: p.value || 1, radius: R });
      }
      heat.setData({ max: HEAT_MAX, data });
    };
    // pan 중 bounds_changed 폭주 → rAF 로 프레임당 1회. heatmap 모드 아니면 스케줄 생략(낭비 방지).
    // 줌 애니메이션 중에도 스킵 — 타일 로드·스케일 전환만으로 비싼 구간이라 히트 재계산을
    // 끝난 뒤 1회로 미룬다(전환 중 ~0.3초 히트가 어긋났다 스냅되는 트레이드오프).
    const schedule = () => {
      if (displayModeRef.current !== 'heatmap') return;
      if (zooming) return;
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(() => {
        pending = false;
        redraw();
      });
    };
    heatScheduleRef.current = schedule;

    const onZoomStart = () => {
      zooming = true;
    };
    // idle 에서도 해제 — zoom_changed 없이 끝나는 제스처(취소 등)로 플래그가 박제되는 것 방지.
    const onSettled = () => {
      zooming = false;
      schedule();
    };
    k.maps.event.addListener(map, 'zoom_start', onZoomStart);
    k.maps.event.addListener(map, 'zoom_changed', onSettled);
    k.maps.event.addListener(map, 'idle', onSettled);
    k.maps.event.addListener(map, 'bounds_changed', schedule);

    // 컨테이너 리사이즈(회전/레이아웃) — setData 는 캔버스를 안 키우므로 configure 로 리사이즈 후 재계산.
    const ro = new ResizeObserver(() => {
      const el = heatRef.current;
      if (!el) return;
      heat.configure({ width: el.clientWidth, height: el.clientHeight });
      schedule();
    });
    ro.observe(heatRef.current);

    return () => {
      cancelAnimationFrame(rafId); // 언마운트 시 대기 중 rAF 가 분리된 지도에 getProjection 호출하는 것 방지
      k.maps.event.removeListener(map, 'zoom_start', onZoomStart);
      k.maps.event.removeListener(map, 'zoom_changed', onSettled);
      k.maps.event.removeListener(map, 'idle', onSettled);
      k.maps.event.removeListener(map, 'bounds_changed', schedule);
      ro.disconnect();
      heatScheduleRef.current = null;
      heatInstanceRef.current = null;
    };
  }, [ready]);

  // 모드/점 변경 → 히트맵 갱신. heatmap 이면 redraw, 아니면 비워서 투명(캔버스는 유지).
  useEffect(() => {
    if (!ready) return;
    const heat = heatInstanceRef.current;
    if (!heat) return;
    if (displayMode === 'heatmap') heatScheduleRef.current?.();
    else heat.setData({ max: HEAT_MAX, data: [] });
  }, [ready, displayMode, heatPoints]);

  if (!kakaoJsKey) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Kakao Maps 플레이스홀더</Text>
        <Text style={styles.placeholderDesc}>
          실제 지도 렌더링에는 Kakao JS Key가 필요합니다.
          {'\n'}
          .env.local에 EXPO_PUBLIC_KAKAO_JS_KEY를 설정하고 재시작하세요.
        </Text>
        <View style={styles.chipRow}>
          {markers.map((m) => (
            <Text
              key={m.id}
              onPress={() => onMarkerPress?.(m.id)}
              style={[styles.chip, { backgroundColor: m.color }]}
            >
              {m.label}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          // 정적 지도(interactive=false)는 카드 높이(120·132)를 따라야 한다 — 300 하한이 있으면
          // 지도가 카드보다 커져 중심(핀)이 카드 아래로 잘린다(MapPreviewCard 웹 실측).
          minHeight: interactive ? 300 : undefined,
          backgroundColor: colors.background,
        }}
      />
      {/* KDE 히트맵 캔버스 — 지도 위 투명 오버레이. display 토글 안 함(생성 시 getComputedStyle
          폭이 auto→NaN 되는 것 회피). heatmap 모드 아니면 빈 데이터로 투명.
          h337 는 생성 시 container.style.position='relative' 를 강제로 덮어쓴다. heatRef 에
          position:absolute 를 직접 주면 그게 무효화돼, in-flow 인 지도 div 뒤로 흘러내려
          캔버스가 화면 밖(컨테이너 맨 아래)으로 나간다. → 절대배치 wrapper 로 감싸고 heatRef 는
          100%×100% 만 줘서, h337 가 relative 로 바꿔도 wrapper 안을 꽉 채워 지도 위에 정렬되게 한다. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <div ref={heatRef} style={{ width: '100%', height: '100%' }} />
      </div>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>지도 로드 실패: {error}</Text>
          <Text style={styles.errorHint}>
            Kakao Developers → 플랫폼 Web에 현재 도메인(http://localhost:8081)을 등록했는지 확인하세요.
          </Text>
        </View>
      ) : null}
      <MapClusterSheet items={activeGroup} onClose={closeGroup} onPick={pickFromGroup} />
    </View>
  );
  },
);

export function fieldsToMarkers(fields: Field[]): KakaoMapMarker[] {
  return fields.map((f) => ({
    id: f.id,
    lat: f.latitude,
    lng: f.longitude,
    label: f.address.split(' ').slice(-1)[0] || '현장',
    color: colors.fieldStatus[f.status],
    shape: STATUS_TO_SHAPE[f.status],
    badge: STATUS_TO_BADGE[f.status],
  }));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, position: 'relative' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: '#f1f5f9',
  },
  placeholderTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  placeholderDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    maxWidth: 360,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.xs,
    overflow: 'hidden',
  },
  errorBox: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: withAlpha(colors.danger, 0.93),
    padding: spacing.md,
    borderRadius: 8,
  },
  errorText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  errorHint: { color: '#fff', fontSize: fontSize.xs, marginTop: 4 },
  warnBanner: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: withAlpha(colors.warning, 0.93),
    padding: spacing.md,
    borderRadius: 8,
  },
  warnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
});

/** 카카오 기본 축척 막대(숫자+km|m 글자를 가진 블록)를 숨긴다. 로고는 남긴다. 네이티브 HTML 도 같은 규칙. */
function hideKakaoScale(root: HTMLElement) {
  root.querySelectorAll('div').forEach((el) => {
    if (el.children.length === 0 && /^\d+(km|m)$/.test(el.textContent?.trim() ?? '')) {
      const block = el.parentElement;
      if (block) block.style.visibility = 'hidden';
    }
  });
}

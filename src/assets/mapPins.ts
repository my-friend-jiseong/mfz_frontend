// 2차 지도 핀(Figma Pin 532:1103 · Pin/Number 532:1123 · 7-9 건너뛴 핀) HTML 조각.
// 네이티브 WebView(kakaoMapHtml.ts)와 웹(KakaoMapWebView.web.tsx)이 같은 문자열을 쓴다.
// 네이티브는 함수를 HTML 에 넣을 수 없어서(Hermes 는 Function#toString 이 소스를 안 준다)
// 조합별 템플릿을 미리 만들어 JSON 으로 넣고, 순번 자리 __N__ 만 페이지 안에서 바꾼다.
import { c2, pinShadowFilterCss } from '@/theme/v2';

/** 조치 전·중·완료, 새 현장(검은 핀), 검색 위치(돋보기), 방문함(회색), 건너뜀(흰 바탕 회색 점선) */
export type MapPinKind = 'pending' | 'in_progress' | 'done' | 'new' | 'search' | 'visited' | 'skipped';

export const PIN_KINDS: MapPinKind[] = ['pending', 'in_progress', 'done', 'new', 'search', 'visited', 'skipped'];

const W = 32;
const H = 44;
// Figma 내보내기(39×51, 그림자 여백 포함)에서 핀 본체 좌표를 그대로 쓰고 viewBox 로 32×44 를 잘라낸다.
const VIEWBOX = '3.2 0.2 32 44';
// 핀 끝(좌표가 가리키는 점)의 세로 위치 — 41 - 0.2 = 40.8 / 44.
export const PIN_TIP_Y_RATIO = 40.8 / H;
// 선택된 현장 크기 두 가지(Figma Pin 설명 '1.19~1.44배').
//   sm: 1.19배(38×52) + 바닥 타원 58×20 — 8 체크인 지도 카드(120)·전체 지도
//   lg: 1.44배(46×63) + 바닥 타원 60×22 — 5 현장 상세 지도 카드(132)
// 타원 중심은 핀 끝보다 sm 2px, lg 7px 위(Figma 프레임 좌표 그대로).
export type PinSelectedSize = 'sm' | 'lg';
const SELECTED: Record<PinSelectedSize, { scale: number; gw: number; gh: number; lift: number }> = {
  sm: { scale: 1.19, gw: 58, gh: 20, lift: 2 },
  lg: { scale: 1.4375, gw: 60, gh: 22, lift: 7 },
};

const BODY =
  'M19.2 41C17.6 37.2 6.2 28.2 6.2 16.5C6.2 13.05 7.57 9.75 10.01 7.31C12.45 4.87 15.75 3.5 19.2 3.5C22.65 3.5 25.95 4.87 28.39 7.31C30.83 9.75 32.2 13.05 32.2 16.5C32.2 28.2 20.8 37.2 19.2 41Z';

const WHITE = c2.text.inverse;

const FILL: Record<MapPinKind, string> = {
  pending: c2.status.pending,
  in_progress: c2.status.inProgress,
  done: c2.status.done,
  new: c2.status.new,
  search: c2.status.new,
  visited: c2.status.visited,
  skipped: c2.bg.canvas,
};

function glyph(kind: MapPinKind): string {
  switch (kind) {
    case 'in_progress':
      return `<path d="M19.2 10.7L25.2 21.2H13.2L19.2 10.7Z" fill="${WHITE}" stroke="${WHITE}" stroke-width="2" stroke-linejoin="round"/>`;
    case 'done':
      return `<path d="M14.1 16.7L17.9 20.5L25.5 12.1" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    case 'new':
      return `<circle cx="19.2" cy="16.5" r="5" fill="${WHITE}"/>`;
    case 'search':
      return `<circle cx="18.2" cy="15.5" r="4.6" stroke="${WHITE}" stroke-width="2.2" fill="none"/><path d="M21.6 18.9L24.6 21.9" stroke="${WHITE}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'skipped':
      return `<circle cx="19.2" cy="16.5" r="4.6" fill="${c2.status.visited}"/>`;
    default:
      return `<circle cx="19.2" cy="16.5" r="4.6" fill="${WHITE}"/>`;
  }
}

function numberText(kind: MapPinKind, n: string): string {
  const color = kind === 'skipped' ? c2.status.visited : WHITE;
  return `<text x="19.2" y="21.5" text-anchor="middle" fill="${color}" font-family="Pretendard,-apple-system,system-ui,sans-serif" font-size="14" font-weight="800" letter-spacing="-0.2">${n}</text>`;
}

/**
 * 핀 하나의 HTML. 바깥 div 크기 = 핀 크기(선택 시 1.19배)라 CustomOverlay 는
 * xAnchor 0.5 · yAnchor PIN_TIP_Y_RATIO 로 놓으면 핀 끝이 좌표에 온다.
 * 선택된 핀은 바닥에 상태색 타원(58×20)을 깐다(Figma 5·8 지도 카드).
 */
export function buildPinHtml(
  kind: MapPinKind,
  order?: number | string | null,
  selected?: PinSelectedSize | null,
): string {
  const sel = selected ? SELECTED[selected] : null;
  const s = sel ? sel.scale : 1;
  const w = Math.round(W * s);
  const h = Math.round(H * s);
  const body =
    kind === 'skipped'
      ? `<path d="${BODY}" fill="${FILL.skipped}" stroke="${c2.status.visited}" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray="3 3"/>`
      : `<path d="${BODY}" fill="${FILL[kind]}" stroke="${WHITE}" stroke-width="2.4" stroke-linejoin="round"/>`;
  const inner = order != null && order !== '' ? numberText(kind, String(order)) : glyph(kind);
  const tipY = h * PIN_TIP_Y_RATIO;
  const groundAlpha = kind === 'new' || kind === 'search' ? [0.1, 0.35] : [0.22, 0.55];
  const ground = sel
    ? `<div style="position:absolute;left:${(w - sel.gw) / 2}px;top:${tipY - sel.lift - sel.gh / 2}px;width:${sel.gw}px;height:${sel.gh}px;border-radius:${sel.gh / 2}px;box-sizing:border-box;background:${hexA(FILL[kind === 'skipped' ? 'visited' : kind], groundAlpha[0])};border:2px solid ${hexA(FILL[kind === 'skipped' ? 'visited' : kind], groundAlpha[1])};"></div>`
    : '';
  return (
    `<div style="position:relative;width:${w}px;height:${h}px;cursor:pointer;">` +
    ground +
    `<svg width="${w}" height="${h}" viewBox="${VIEWBOX}" fill="none" style="position:relative;overflow:visible;filter:${pinShadowFilterCss};">${body}${inner}</svg>` +
    `</div>`
  );
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 네이티브 HTML 용 템플릿. 키: `${kind}|${numbered?1:0}|${'0'|'sm'|'lg'}` */
export const PIN_TEMPLATES: Record<string, string> = Object.fromEntries(
  PIN_KINDS.flatMap((k) =>
    [0, 1].flatMap((num) =>
      (['0', 'sm', 'lg'] as const).map((sel) => [
        `${k}|${num}|${sel}`,
        buildPinHtml(k, num ? '__N__' : null, sel === '0' ? null : sel),
      ]),
    ),
  ),
);

/** 출발 위치(3-8): 흰 원 + 4px 검은 테두리 18. */
export const START_POINT_HTML = `<div style="width:18px;height:18px;border-radius:9px;box-sizing:border-box;background:${c2.bg.canvas};border:4px solid ${c2.bg.ink};pointer-events:none;"></div>`;

/** GPS 오차 원(8-12) — kakao.maps.Circle 옵션. */
export const ACCURACY_CIRCLE_STYLE = {
  strokeWeight: 1,
  strokeColor: c2.text.warning,
  strokeOpacity: 0.55,
  strokeStyle: 'dash',
  fillColor: c2.status.pending,
  fillOpacity: 0.1,
} as const;

/** 경로선 모양(3-8 지나온 길: 진한 파랑 실선, 7-9 남은 길: 파랑 점선, 건너뛴 곳으로: 회색 점선). */
export type MapPathTone = 'brand' | 'muted';
export interface MapPath {
  points: { lat: number; lng: number }[];
  tone?: MapPathTone;
  dotted?: boolean;
}
export function pathStyle(p: MapPath) {
  const brand = (p.tone ?? 'brand') === 'brand';
  return {
    strokeWeight: brand || !p.dotted ? 4.5 : 4,
    strokeColor: brand ? c2.bg.brand : c2.status.visited,
    strokeOpacity: brand ? (p.dotted ? 0.75 : 0.7) : 1,
    strokeStyle: p.dotted ? 'shortdot' : 'solid',
  };
}

// 2차 지도 핀(Figma Pin 532:1103 · Pin/Number 532:1123 · 7-9 건너뛴 핀) HTML 조각.
// 네이티브 WebView(kakaoMapHtml.ts)와 웹(KakaoMapWebView.web.tsx)이 같은 문자열을 쓴다.
// 네이티브는 함수를 HTML 에 넣을 수 없어서(Hermes 는 Function#toString 이 소스를 안 준다)
// 조합별 템플릿을 미리 만들어 JSON 으로 넣고, 순번 자리 __N__ 만 페이지 안에서 바꾼다.
import { c2, pinShadowFilterCss, shadowCss } from '@/theme/v2';

/**
 * 조치 전·중·완료, 새 현장(검은 핀), 검색 위치(돋보기), 방문함(회색), 건너뜀(흰 바탕 회색 점선),
 * 사진 묶음(8-7 파란 순번 원 — 물방울이 아니라 원이고 가운데가 좌표).
 */
export type MapPinKind = 'pending' | 'in_progress' | 'done' | 'new' | 'search' | 'visited' | 'skipped' | 'group';

export const PIN_KINDS: MapPinKind[] = ['pending', 'in_progress', 'done', 'new', 'search', 'visited', 'skipped', 'group'];

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
//   next: 1.19배(38×52), 바닥 타원 없음 — 6 외근 준비·7 외근 진행의 다음 목적지 순번 핀(Figma 6·7 '1번째 목적지, 다음').
export type PinSelectedSize = 'sm' | 'lg' | 'next';
const SELECTED: Record<PinSelectedSize, { scale: number; gw: number; gh: number; lift: number } | { scale: number; gw: 0 }> = {
  sm: { scale: 1.19, gw: 58, gh: 20, lift: 2 },
  lg: { scale: 1.4375, gw: 60, gh: 22, lift: 7 },
  next: { scale: 1.19, gw: 0 },
};
const SELECTED_SIZES: PinSelectedSize[] = ['sm', 'lg', 'next'];

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
  group: c2.bg.brand,
};

// 8-7 사진 묶음 순번 원(Figma 600:2867): 34, 흰 테두리 3, 숫자 15 ExtraBold, 그림자 0 2 3 ink 0.3.
const GROUP_D = 34;
const GROUP_SHADOW = 'drop-shadow(0px 2px 3px rgba(15,23,42,0.3))';

/**
 * 순번 원 HTML. 지도는 모든 2차 핀을 yAnchor PIN_TIP_Y_RATIO(물방울 끝)로 놓으므로, 바깥 상자는 원 크기로 두고
 * 원을 그만큼 아래로 내려 원 가운데가 좌표에 오게 한다.
 */
function groupDotHtml(n: string): string {
  const top = GROUP_D * PIN_TIP_Y_RATIO - GROUP_D / 2;
  return (
    `<div style="position:relative;width:${GROUP_D}px;height:${GROUP_D}px;">` +
    `<div style="position:relative;top:${top.toFixed(2)}px;width:${GROUP_D}px;height:${GROUP_D}px;box-sizing:border-box;border-radius:${GROUP_D / 2}px;` +
    `background:${FILL.group};border:3px solid ${WHITE};filter:${GROUP_SHADOW};display:flex;align-items:center;justify-content:center;cursor:pointer;` +
    `color:${WHITE};font-family:Pretendard,-apple-system,system-ui,sans-serif;font-size:15px;font-weight:800;line-height:22px;letter-spacing:-0.2px;">${n}</div>` +
    `</div>`
  );
}

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
  /** 핀 아래 이름표(Figma 6 '낙동대로 351'). 네이티브는 PIN_TAG_TEMPLATE 로 같은 모양을 붙인다. */
  nameTag?: string | null,
): string {
  if (kind === 'group') return groupDotHtml(order != null ? String(order) : '');
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
  const ground = sel && 'gh' in sel
    ? `<div style="position:absolute;left:${(w - sel.gw) / 2}px;top:${tipY - sel.lift - sel.gh / 2}px;width:${sel.gw}px;height:${sel.gh}px;border-radius:${sel.gh / 2}px;box-sizing:border-box;background:${hexA(FILL[kind === 'skipped' ? 'visited' : kind], groundAlpha[0])};border:2px solid ${hexA(FILL[kind === 'skipped' ? 'visited' : kind], groundAlpha[1])};"></div>`
    : '';
  const tag = nameTag ? nameTagHtml(Math.round(tipY) + 3, escapeHtml(nameTag)) : '';
  return (
    `<div style="position:relative;width:${w}px;height:${h}px;cursor:pointer;">` +
    ground +
    `<svg width="${w}" height="${h}" viewBox="${VIEWBOX}" fill="none" style="position:relative;overflow:visible;filter:${pinShadowFilterCss};">${body}${inner}</svg>` +
    tag +
    `</div>`
  );
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 핀 아래 이름표 — 핀 끝 3px 아래 가운데. top·글자는 호출부가 넣는다(글자는 이미 이스케이프된 것).
function nameTagHtml(top: number | string, text: string): string {
  return `<div style="position:absolute;left:50%;top:${top}px;transform:translateX(-50%);white-space:nowrap;padding:2px 8px;border-radius:10px;background:${c2.bg.canvas};color:${c2.text.primary};font-family:Pretendard,-apple-system,system-ui,sans-serif;font-size:12px;font-weight:700;line-height:16px;letter-spacing:-0.2px;box-shadow:0 1px 1.5px rgba(15,23,42,0.3),0 2px 6px rgba(15,23,42,0.12);pointer-events:none;">${text}</div>`;
}

/** 네이티브용 이름표 조각. __TOP__·__TAG__ 를 페이지 안에서 바꿔 핀 템플릿 끝 `</div>` 앞에 붙인다. */
export const PIN_TAG_TEMPLATE = nameTagHtml('__TOP__', '__TAG__');
/** 핀 크기별 이름표 top(px) — 키는 PIN_TEMPLATES 의 마지막 칸('0'|'sm'|'lg'|'next'). */
export const PIN_TAG_TOP: Record<string, number> = Object.fromEntries(
  (['0', ...SELECTED_SIZES] as const).map((sel) => {
    const scale = sel === '0' ? 1 : SELECTED[sel].scale;
    return [sel, Math.round(Math.round(H * scale) * PIN_TIP_Y_RATIO) + 3];
  }),
);

/** 네이티브 HTML 용 템플릿. 키: `${kind}|${numbered?1:0}|${'0'|'sm'|'lg'|'next'}` */
export const PIN_TEMPLATES: Record<string, string> = Object.fromEntries(
  PIN_KINDS.flatMap((k) =>
    [0, 1].flatMap((num) =>
      (['0', ...SELECTED_SIZES] as const).map((sel) => [
        `${k}|${num}|${sel}`,
        buildPinHtml(k, num ? '__N__' : null, sel === '0' ? null : sel),
      ]),
    ),
  ),
);

// === 상태 핀 묶기·줌 축소(1·4·6 지도의 현장 핀) ===
// 32×44 핀은 넓은 줌에서 서로 겹쳐 아래 핀을 누를 수 없게 된다. 순번·선택·이름표가 없는 조치 상태 핀만
// 화면 거리로 묶고(가장 급한 상태가 대표), 넓은 줌에서는 작게 그린다. 순번 핀(6·7)은 하나하나가 의미라 그대로 둔다.

/** 묶음 대표를 고르는 순서 — 조치 전이 가장 급하다. */
export const CLUSTER_PIN_PRIORITY: Partial<Record<MapPinKind, number>> = { pending: 0, in_progress: 1, done: 2 };

/** 묶고 줄여도 되는 핀인가 — 조치 상태 핀이면서 순번·선택·이름표가 없는 것. */
export function isClusterablePin(m: { pin?: string; order?: number; selected?: boolean; nameTag?: string }): boolean {
  return m.pin != null && m.pin in CLUSTER_PIN_PRIORITY && typeof m.order !== 'number' && !m.selected && !m.nameTag;
}

/** 카카오 레벨(클수록 넓게)별 상태 핀 배율. 가까이서는 Figma 크기 그대로. */
export function pinScaleForLevel(level: number): number {
  if (level >= 9) return 0.6;
  if (level >= 7) return 0.75;
  return 1;
}
export const PIN_SCALES = [1, 0.75, 0.6] as const;

/**
 * 이 화면 거리(px) 안의 상태 핀은 한 묶음 — 핀 폭(32)보다 조금 좁게 잡아 실제로 겹치는 것만.
 * 핀을 줄여도 거리는 줄이지 않는다: 배지(20)는 그대로라 거리를 같이 줄이면 넓은 줌에서 배지끼리 겹친다(웹 실측).
 */
export const PIN_CLUSTER_PX = 28;

// 묶음 수 배지 — 작은 목적지 버튼(DestinationFAB 44)의 흰 배지와 같은 모양(흰 원 20, 브랜드 글 12 ExtraBold).
function countBadgeHtml(left: number, top: number, count: string): string {
  return (
    `<div style="position:absolute;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;min-width:20px;height:20px;padding:0 4px;box-sizing:border-box;border-radius:10px;` +
    `background:${c2.bg.canvas};box-shadow:${shadowCss.badge};display:flex;align-items:center;justify-content:center;` +
    `color:${c2.text.brand};font-family:Pretendard,-apple-system,system-ui,sans-serif;font-size:12px;font-weight:800;line-height:16px;letter-spacing:-0.2px;">${count}</div>`
  );
}

/**
 * 기본 크기 핀 HTML(pinHtml)을 배율·묶음 수와 함께 감싼다. 바깥 상자는 32×44 그대로라 CustomOverlay 의
 * xAnchor 0.5 · yAnchor PIN_TIP_Y_RATIO 가 그대로 맞고, 핀은 끝을 중심으로 줄어든다.
 * 배지는 줄이지 않는다(글자가 안 읽힌다) — 줄어든 핀의 오른쪽 위에 붙인다.
 * count 는 2 이상 숫자 또는 네이티브 템플릿 자리표시('__C__'), 1 이면 배지 없음.
 */
export function wrapPinHtml(pin: string, scale: number, count: number | string): string {
  const hasBadge = typeof count === 'string' || count > 1;
  if (scale === 1 && !hasBadge) return pin;
  const tipX = W / 2;
  const tipY = H * PIN_TIP_Y_RATIO;
  // 줄어든 핀 본체의 오른쪽 위(실제 그림은 viewBox 기준 폭 26 → 오른쪽 끝 ≈ tipX + 13·scale, 위 ≈ 3.3·scale).
  const right = tipX + 13 * scale;
  const top = tipY - (tipY - 3.3) * scale;
  const badge = hasBadge ? countBadgeHtml(right - 9, top - 8, String(count)) : '';
  return (
    `<div style="position:relative;width:${W}px;height:${H}px;pointer-events:none;">` +
    `<div style="position:absolute;inset:0;transform:scale(${scale});transform-origin:${tipX}px ${tipY.toFixed(2)}px;pointer-events:auto;">${pin}</div>` +
    (badge ? badge.replace('position:absolute;', 'position:absolute;pointer-events:auto;cursor:pointer;') : '') +
    `</div>`
  );
}

/** 네이티브 HTML 용 감싸기 템플릿. 키: `${scale}|${badge?1:0}`, 자리표시 __PIN__ · __C__. */
export const PIN_WRAP_TEMPLATES: Record<string, string> = Object.fromEntries(
  PIN_SCALES.flatMap((s) => [
    [`${s}|0`, wrapPinHtml('__PIN__', s, 1)],
    [`${s}|1`, wrapPinHtml('__PIN__', s, '__C__')],
  ]),
);

/** 출발 위치(3-8): 흰 원 + 4px 검은 테두리 18. */
export const START_POINT_HTML = `<div style="width:18px;height:18px;border-radius:9px;box-sizing:border-box;background:${c2.bg.canvas};border:4px solid ${c2.bg.ink};pointer-events:none;"></div>`;

/** 위치 오차 원 색. warning = GPS 약함(8-5·8-12), brand = 보통 오차(8-3·8-11). */
export type AccuracyTone = 'warning' | 'brand';

/** GPS 오차 원(8-12) — kakao.maps.Circle 옵션. */
export const ACCURACY_CIRCLE_STYLE = {
  strokeWeight: 1,
  strokeColor: c2.text.warning,
  strokeOpacity: 0.55,
  strokeStyle: 'dash',
  fillColor: c2.status.pending,
  fillOpacity: 0.1,
} as const;

/** 보통 오차 원(8-3 Figma 694:4460) — 파랑 0.1 바탕, 0.35 실선. */
export const ACCURACY_CIRCLE_STYLE_BRAND = {
  strokeWeight: 1,
  strokeColor: c2.bg.brand,
  strokeOpacity: 0.35,
  strokeStyle: 'solid',
  fillColor: c2.bg.brand,
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

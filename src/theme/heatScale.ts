// 히트맵(KDE 밀도) 색 척도 — 지도 렌더(네이티브 HTML·웹)와 범례가 공유하는 단일 소스.
//
// choroplethScale 와 달리 여기서는 heatmap.js(h337) 에 그대로 넘기는 옵션 형태로 노출한다.
//   - HEAT_GRADIENT : h337 gradient (offset→hex). 파랑→초록→주황→빨강 다색.
//   - HEAT_CONFIG   : h337 create 옵션(radius/blur/opacity).
//   - HEAT_MAX      : setData 의 max — "약 N건 누적 시 최고온". 포화 제어의 핵심 값.
// HTML 문자열(kakaoMapHtml.ts)·웹 컴포넌트·범례가 전부 이 상수를 참조해 3곳 색 불일치를 차단한다.

import { palette } from './palette';

// 다색 gradient — 단색 빨강 대비 밀도 차이가 명도+색상으로 읽힌다.
// 원본 가이드의 임의 hex(#378ADD 등) 대신 우리 팔레트 hue 로 매핑.
export const HEAT_GRADIENT: Record<number, string> = {
  0.1: palette.blue[500], // #3b82f6 — 저밀도(차가움)
  0.4: palette.green[500], // #22c55e
  0.7: palette.amber[500], // #f59e0b
  1.0: palette.red[600], // #dc2626 — 고밀도(뜨거움)
};

// h337 create 옵션. radius 는 화면 px(줌 무관 고정) — 작을수록 군집이 또렷.
export const HEAT_CONFIG = {
  radius: 28,
  maxOpacity: 0.6,
  minOpacity: 0,
  blur: 0.85,
} as const;

// setData({ max }) — 몇 건이 겹쳐야 최고온(빨강)에 닿는가.
// 부산 데모 데이터 규모(현장 수십~수백)에 맞춘 값. 화면이 다 빨개지면 올린다(§6).
export const HEAT_MAX = 10;

// === 범례용 ===
// h337 은 stop 사이를 연속 보간하므로, 범례 바도 보간된 셀로 그려 실제 렌더와 일치시킨다.
// (기존 MapLegend 의 근사 HEATMAP_STEPS 단색 알파를 대체)

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const ch = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// 정렬된 gradient 스톱 [offset, hex].
const SORTED_STOPS = Object.keys(HEAT_GRADIENT)
  .map(Number)
  .sort((x, y) => x - y)
  .map((offset) => [offset, HEAT_GRADIENT[offset]] as const);

// 범례 바를 그릴 count 개 색 — offset 0→1 을 균등 샘플해 스톱 사이 보간.
export function heatLegendCells(count = 16): string[] {
  const cells: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = count === 1 ? 1 : i / (count - 1);
    // off 를 감싸는 두 스톱을 찾아 보간.
    let lo = SORTED_STOPS[0];
    let hi = SORTED_STOPS[SORTED_STOPS.length - 1];
    for (let s = 0; s < SORTED_STOPS.length - 1; s++) {
      if (off >= SORTED_STOPS[s][0] && off <= SORTED_STOPS[s + 1][0]) {
        lo = SORTED_STOPS[s];
        hi = SORTED_STOPS[s + 1];
        break;
      }
    }
    const span = hi[0] - lo[0];
    const t = span === 0 ? 0 : (off - lo[0]) / span;
    cells.push(hexLerp(lo[1], hi[1], t));
  }
  return cells;
}

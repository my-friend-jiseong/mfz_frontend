// 단계구분도(choropleth) 색 척도 — 지도 렌더와 범례가 공유하는 단일 소스.
//
// 절대 건수 구간(이산 단계)으로 매핑한다. max 상대 정규화를 쓰지 않으므로
// 데이터가 적어도 "현장 1건"이 최댓값 농도로 과장되지 않는다 — 건수=색.
// 단일 색조(파랑) sequential: 색상은 고정, 농도(fillOpacity)만 단계별로 키운다.

import { colors } from './colors';

export const CHOROPLETH_COLOR = colors.primary; // blue.600 (#2563eb) — 지도 폴리곤 fillColor 와 동일

// 각 구간의 하한(min, 포함) + 농도. 오름차순.
const BINS: { min: number; opacity: number }[] = [
  { min: 1, opacity: 0.16 },
  { min: 3, opacity: 0.3 },
  { min: 5, opacity: 0.44 },
  { min: 10, opacity: 0.58 },
  { min: 20, opacity: 0.72 },
];

// 현장 수 → fillOpacity. 0건은 0(미채색).
export function fillOpacityForCount(count: number): number {
  if (count <= 0) return 0;
  let opacity = 0;
  for (const bin of BINS) {
    if (count >= bin.min) opacity = bin.opacity;
    else break;
  }
  return opacity;
}

export interface ChoroplethLegendItem {
  label: string; // 예: "1–2", "20+"
  color: string;
  opacity: number;
}

// 범례용 항목 — BINS 에서 라벨을 파생(다음 구간 하한−1). 척도 변경 시 범례도 자동 추종.
export function choroplethLegend(): ChoroplethLegendItem[] {
  return BINS.map((bin, i) => {
    const next = BINS[i + 1];
    let label: string;
    if (!next) label = `${bin.min}+`;
    else if (next.min - 1 > bin.min) label = `${bin.min}–${next.min - 1}`;
    else label = `${bin.min}`;
    return { label, color: CHOROPLETH_COLOR, opacity: bin.opacity };
  });
}

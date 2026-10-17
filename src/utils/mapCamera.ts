// 지도 카메라 계산(웹 KakaoMapWebView.web·네이티브 kakaoMapHtml 공통 규칙 — 네이티브는 HTML 안에 같은 식을
// 옮겨 적었다. 바꾸면 둘 다 바꾼다). 좌표는 모두 '지금 레벨'의 지도 컨테이너 px.

import { closestFitLevel } from './cardMapFit';

export interface Pt {
  x: number;
  y: number;
}

/**
 * 점들(px)이 여백 [위, 오른쪽, 아래, 왼쪽] 안에 들어가는 가장 가까운 레벨과, 그 레벨에서 화면 가운데에 올
 * 지점(지금 레벨 px). 상자가 0 이하(레이아웃 전)면 null. 점 하나면 그 점·single 레벨.
 */
export function fitCamera(
  pts: Pt[],
  cur: number,
  w: number,
  h: number,
  pad: [number, number, number, number],
  single = 5,
): { level: number; center: Pt } | null {
  if (pts.length === 0) return null;
  if (pts.length === 1) return { level: single, center: pts[0] };
  const [pt, pr, pb, pl] = pad;
  const boxW = w - pl - pr;
  const boxH = h - pt - pb;
  if (boxW <= 0 || boxH <= 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const level = closestFitLevel(x1 - x0, y1 - y0, cur, boxW, boxH, 1);
  const s = Math.pow(2, cur - level);
  // 새 레벨에서 상자 가운데가 점들 가운데에 오도록 — 화면 가운데와 상자 가운데의 차이를 지금 레벨 px 로.
  const dx = (w / 2 - (pl + boxW / 2)) / s;
  const dy = (h / 2 - (pt + boxH / 2)) / s;
  return { level, center: { x: (x0 + x1) / 2 + dx, y: (y0 + y1) / 2 + dy } };
}

/**
 * 화면 가운데 c 를 보던 지도를 배율 s(2^(지금 레벨 − 새 레벨))로 줌하면서 target 이 가운데에 오게 하는 줌 기준점.
 * 기준점 A 는 줌 동안 화면에 고정되고 나머지는 A 에서 s 배로 멀어진다: A + (c − A)/s = target.
 */
export function zoomAnchor(c: Pt, target: Pt, s: number): Pt {
  return { x: (s * target.x - c.x) / (s - 1), y: (s * target.y - c.y) / (s - 1) };
}

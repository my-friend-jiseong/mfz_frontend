// 정적 지도 카드(MapPreviewCard 3·5·8, 보고서 위치도 9·9-7)의 맞춤 규칙.
// 카드는 120~152 로 낮아서 카카오 setBounds 가 고르는 레벨(정수)이 핀 주변을 너무 넓게 남긴다 —
// 점들이 여백 안에 들어가는 가장 가까운 레벨을 직접 고른다. 네이티브 HTML(kakaoMapHtml.ts)에도 같은 규칙이 있다
// (Hermes 는 함수 소스를 HTML 에 넣을 수 없어 따로 옮겨 적었다 — 바꾸면 둘 다 바꾼다).

/** 카드 핀 배율 — Figma 기본 핀(32×44)의 0.75배(24×33). 선택 핀도 키우지 않는다. */
export const CARD_PIN_SCALE = 0.75;

/** 카드 맞춤 여백 [위, 오른쪽, 아래, 왼쪽] px. 위 = 작은 핀이 끝 위로 솟는 높이(≈31)+3, 옆 = 핀 반폭 12 + 6, 아래 = 그림자. */
export const CARD_FIT_PADDING: [number, number, number, number] = [34, 18, 6, 18];

/** 카드가 다가가는 가장 가까운 레벨 — 핀 하나면 이 레벨(골목·건물이 보이는 거리, 카드 폭 350 ≈ 350m). */
export const CARD_MIN_LEVEL = 3;

/** 내 위치 점(지름 18)을 함께 넣을 때 아래 여백 최소값 — 점이 카드 아래에 반쯤 잘리지 않게. */
export const CARD_DOT_PAD = 12;

const MAX_LEVEL = 14;

/**
 * 레벨 cur 에서 잰 점들의 화면 폭·높이(px)가 상자(boxW×boxH)에 들어가는 가장 가까운 레벨.
 * 카카오 지도는 레벨 하나에 정확히 2배라 한 번 재서 계산할 수 있다.
 */
export function closestFitLevel(
  extentX: number,
  extentY: number,
  cur: number,
  boxW: number,
  boxH: number,
  min: number = CARD_MIN_LEVEL,
): number {
  for (let level = min; level < MAX_LEVEL; level++) {
    const f = Math.pow(2, cur - level);
    if (extentX * f <= boxW && extentY * f <= boxH) return level;
  }
  return MAX_LEVEL;
}

/** 오차 원(반지름 m)의 위·아래·왼·오른 끝 좌표 — 원이 카드 안에 다 들어오게 맞춤 점에 넣는다. */
export function circleExtremes(c: { lat: number; lng: number; radius: number }): { lat: number; lng: number }[] {
  const dLat = c.radius / 111320;
  const dLng = c.radius / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return [
    { lat: c.lat + dLat, lng: c.lng },
    { lat: c.lat - dLat, lng: c.lng },
    { lat: c.lat, lng: c.lng + dLng },
    { lat: c.lat, lng: c.lng - dLng },
  ];
}

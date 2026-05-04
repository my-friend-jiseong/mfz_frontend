// 동일 좌표 마커를 그룹으로 묶음. precision=6 → 위·경도 6자리(~10cm) 정밀도.
// 좌표는 절대 변경하지 않음. 지도엔 그룹의 첫 마커만 표시하고 "+N" 뱃지로 다중임을 명시.

export interface PositionedMarker {
  lat: number;
  lng: number;
}

export function groupSameLocationMarkers<T extends PositionedMarker>(
  markers: T[],
  precision = 6,
): T[][] {
  const groups = new Map<string, T[]>();
  for (const m of markers) {
    const key = `${m.lat.toFixed(precision)}:${m.lng.toFixed(precision)}`;
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }
  return Array.from(groups.values());
}

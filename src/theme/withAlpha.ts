// hex 색에 알파를 합쳐 #RRGGBBAA 반환.
// `c + '22'` 같은 string-concat 패턴을 한 곳에서 관리.
// RN 은 #RRGGBBAA 8자리 hex 와 rgba(...) 모두 지원하지만 토큰 일관성을 위해 hex 유지.

export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return `${color}${hex}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    return `${color.slice(0, 7)}${hex}`;
  }
  // rgb(...) / named color — caller 가 알파를 다른 방식으로 처리해야 함.
  return color;
}

// 8 화면에 흩어져 있던 inline 포매터를 단일 진실 출처로 통합.
// 모두 undefined/invalid 안전 — 잘못된 입력에 'Invalid Date' 가 UI 에 노출되지 않게.

function safe(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDate(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function fmtTime(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return d.toLocaleString('ko-KR');
}

export function fmtDuration(
  startIso: string | undefined | null,
  endIso: string | undefined | null,
): string {
  const start = safe(startIso);
  if (!start) return '-';
  if (!endIso) return '진행 중';
  const end = safe(endIso);
  if (!end) return '진행 중';
  // end < start 가드 — clock skew / 백엔드 응답 inverted / 사용자 수정 등으로 음수 가능.
  // '-1시간 -30분' 같은 깨진 출력 대신 0분.
  const diff = Math.max(0, end.getTime() - start.getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

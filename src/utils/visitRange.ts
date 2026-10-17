import type { Field, FieldStatus } from '@/types/entities';
import { fieldActionStatus } from './fieldStatus';

/**
 * 1-3 '최근 방문일' 범위. 날짜는 기기 로컬 'YYYY-MM-DD', 양 끝 포함.
 * all = 거르지 않음(방문한 적 없는 현장도 보임). preset·custom 은 방문한 적 없는 현장을 뺀다.
 * preset.days 는 오늘을 포함한 날 수 — 오늘=1, 1주=7(오늘과 앞 6일).
 */
export type VisitRange =
  | { kind: 'all' }
  | { kind: 'preset'; days: number }
  | { kind: 'custom'; from: string; to: string };

export const ALL_RANGE: VisitRange = { kind: 'all' };

/** 최근 방문일 시트의 빠른 칩. '전체'는 따로(kind all). */
export const RANGE_PRESETS: { days: number; chip: string; label: string }[] = [
  { days: 1, chip: '오늘', label: '오늘' },
  { days: 7, chip: '1주', label: '최근 1주' },
  { days: 30, chip: '1달', label: '최근 1달' },
  { days: 90, chip: '3달', label: '최근 3달' },
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 그날 로컬 자정. */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** n 일 더한 날(음수면 앞). 월·연 경계는 Date 가 정규화한다. */
export function addDays(ymd: string, n: number): string {
  const d = parseYmd(ymd);
  return toYmd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** 범위의 양 끝 날짜. all 이면 null. */
export function rangeBounds(range: VisitRange, now: Date = new Date()): { from: string; to: string } | null {
  if (range.kind === 'all') return null;
  if (range.kind === 'custom') return range.from <= range.to ? { from: range.from, to: range.to } : { from: range.to, to: range.from };
  const today = toYmd(now);
  return { from: addDays(today, -(Math.max(1, range.days) - 1)), to: today };
}

/** 최근 방문 시각(ISO)이 범위 안인가. 방문한 적 없으면 all 일 때만 true. */
export function inVisitRange(visitedAt: string | null | undefined, range: VisitRange, now: Date = new Date()): boolean {
  const b = rangeBounds(range, now);
  if (!b) return true;
  if (!visitedAt) return false;
  const t = new Date(visitedAt);
  if (Number.isNaN(t.getTime())) return false;
  const ymd = toYmd(t);
  return ymd >= b.from && ymd <= b.to;
}

export function isSameRange(a: VisitRange, b: VisitRange): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'preset' && b.kind === 'preset') return a.days === b.days;
  if (a.kind === 'custom' && b.kind === 'custom') return a.from === b.from && a.to === b.to;
  return true;
}

function fmtDay(ymd: string, withYear: boolean): string {
  const d = parseYmd(ymd);
  return `${withYear ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 1-3 '최근 방문일' 행 값 — '전체' · '최근 1주' · '10월 1일 – 10월 17일'. 올해가 아니면 연도를 붙인다. */
export function formatVisitRange(range: VisitRange, now: Date = new Date()): string {
  if (range.kind === 'all') return '전체';
  if (range.kind === 'preset') {
    return RANGE_PRESETS.find((p) => p.days === range.days)?.label ?? `최근 ${range.days}일`;
  }
  const b = rangeBounds(range, now)!;
  const year = String(now.getFullYear());
  const withYear = !b.from.startsWith(year) || !b.to.startsWith(year);
  if (b.from === b.to) return fmtDay(b.from, withYear);
  return `${fmtDay(b.from, withYear)} – ${fmtDay(b.to, withYear)}`;
}

export interface MapFieldFilter {
  /** 빈 배열 = 상태로 거르지 않음. */
  statuses: readonly FieldStatus[];
  range: VisitRange;
  /** 빈 배열 = 분류로 거르지 않음. 고른 분류 중 하나라도 붙은 현장. */
  tags: readonly string[];
}

/** 1-3 지도 설정 필터 — 1 지도(MapDashboard)와 6·7 배경 핀(useSharedMapSettings)이 같이 쓴다. */
export function filterMapFields<F extends Pick<Field, 'status' | 'latestActionStatus' | 'recentVisitedAt' | 'categories'>>(
  list: readonly F[],
  { statuses, range, tags }: MapFieldFilter,
  now: Date = new Date(),
): F[] {
  return list.filter(
    (f) =>
      (statuses.length === 0 || statuses.includes(fieldActionStatus(f))) &&
      inVisitRange(f.recentVisitedAt, range, now) &&
      (tags.length === 0 || tags.some((tag) => f.categories?.includes(tag))),
  );
}

/** 지도 설정이 기본에서 바뀌었나(필터 부분) — 레이어 버튼의 점. */
export function hasMapFilter({ statuses, range, tags }: MapFieldFilter): boolean {
  return statuses.length > 0 || range.kind !== 'all' || tags.length > 0;
}

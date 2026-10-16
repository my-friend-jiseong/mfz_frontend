import type { Trip } from '@/types/entities';

// 2차 외근 표기(1·2 외근 내역, 3 외근 상세, 3-8 경로 지도)를 한곳에서 만든다.

function safe(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 요일 한 글자('월'). 외근 내역 행의 날짜 칸. */
export function weekdayKo(iso: string | undefined | null): string {
  const d = safe(iso);
  return d ? WEEKDAY[d.getDay()] : '';
}

/** 날짜 숫자('8'). 외근 내역 행의 날짜 칸. */
export function dayOfMonth(iso: string | undefined | null): string {
  const d = safe(iso);
  return d ? String(d.getDate()) : '-';
}

/** 기본 제목 'M월 D일 외근'(인수인계 §2 외근). 제목을 비워 둔 외근도 이 이름으로 보인다. */
export function defaultTripTitle(startedAt: string | undefined | null): string {
  const d = safe(startedAt);
  return d ? `${d.getMonth() + 1}월 ${d.getDate()}일 외근` : '외근';
}

/** 화면에 보이는 외근 제목 — 입력한 제목이 없으면 기본 제목. */
export function tripTitle(trip: Pick<Trip, 'title' | 'startedAt'>): string {
  return trip.title?.trim() || defaultTripTitle(trip.startedAt);
}

/** 걸린 시간 '2시간' · '5시간 20분' · '12분'. 0분은 붙이지 않는다(Figma 1·3). 끝이 없으면 ''. */
export function fmtSpan(startIso: string | undefined | null, endIso: string | undefined | null): string {
  const s = safe(startIso);
  const e = safe(endIso);
  if (!s || !e) return '';
  const min = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 'M월 D일 (요일)' */
export function fmtMonthDayWeekday(iso: string | undefined | null): string {
  const d = safe(iso);
  return d ? `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})` : '-';
}

function hm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 3 외근 상세 날짜 줄: '10월 6일 (월) · 09:40 – 11:40 · 2시간'. 다른 날 끝나면 끝 쪽에 날짜를 붙인다. */
export function fmtTripDateLine(trip: Pick<Trip, 'startedAt' | 'endedAt'>): string {
  const s = safe(trip.startedAt);
  if (!s) return '-';
  const head = `${fmtMonthDayWeekday(trip.startedAt)} · ${hm(s)}`;
  const e = safe(trip.endedAt);
  if (!e) return `${head} –`;
  const sameDay = s.toDateString() === e.toDateString();
  const end = sameDay ? hm(e) : `${e.getMonth() + 1}월 ${e.getDate()}일 ${hm(e)}`;
  return `${head} – ${end} · ${fmtSpan(trip.startedAt, trip.endedAt)}`;
}

/** 외근 내역 행 보조 줄: '방문 4건 · 5시간 20분'. */
export function fmtTripSummary(visitCount: number, trip: Pick<Trip, 'startedAt' | 'endedAt'>): string {
  const span = fmtSpan(trip.startedAt, trip.endedAt);
  return span ? `방문 ${visitCount}건 · ${span}` : `방문 ${visitCount}건`;
}

/**
 * 외근 내역 묶음: '이번 주' / '지난주' / 'M월'(올해) / 'YYYY년 M월'(지난해 이전). 주는 월요일 시작.
 * Figma 1·2 는 오늘·어제를 따로 묶지 않는다.
 */
export function tripHistoryGroup(iso: string | undefined | null, now: Date = new Date()): string {
  const d = safe(iso);
  if (!d) return '날짜 없음';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sinceMonday = (today.getDay() + 6) % 7;
  const thisWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday);
  if (target >= thisWeek) return '이번 주';
  const lastWeek = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7);
  if (target >= lastWeek) return '지난주';
  return target.getFullYear() === today.getFullYear()
    ? `${target.getMonth() + 1}월`
    : `${target.getFullYear()}년 ${target.getMonth() + 1}월`;
}

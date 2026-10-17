// 1-3 '최근 방문일' 범위·필터·표기 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, filterMapFields, formatVisitRange, hasMapFilter, inVisitRange, rangeBounds, type VisitRange } from '../visitRange';

// 기기 로컬 2026-10-17 오후 3시.
const NOW = new Date(2026, 9, 17, 15, 0, 0);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

test('addDays 는 월·연 경계를 넘는다', () => {
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('preset 범위는 오늘을 포함한 날 수', () => {
  assert.deepEqual(rangeBounds({ kind: 'preset', days: 1 }, NOW), { from: '2026-10-17', to: '2026-10-17' });
  assert.deepEqual(rangeBounds({ kind: 'preset', days: 7 }, NOW), { from: '2026-10-11', to: '2026-10-17' });
  assert.equal(rangeBounds({ kind: 'all' }, NOW), null);
});

test('custom 범위는 뒤집혀 들어와도 앞뒤를 맞춘다', () => {
  assert.deepEqual(rangeBounds({ kind: 'custom', from: '2026-10-09', to: '2026-10-01' }, NOW), {
    from: '2026-10-01',
    to: '2026-10-09',
  });
});

test('전체는 방문한 적 없는 현장도 통과', () => {
  assert.equal(inVisitRange(null, { kind: 'all' }, NOW), true);
  assert.equal(inVisitRange(undefined, { kind: 'all' }, NOW), true);
});

test('preset·custom 은 방문한 적 없는 현장을 뺀다', () => {
  assert.equal(inVisitRange(null, { kind: 'preset', days: 90 }, NOW), false);
  assert.equal(inVisitRange(undefined, { kind: 'custom', from: '2026-01-01', to: '2026-10-17' }, NOW), false);
  assert.equal(inVisitRange('not-a-date', { kind: 'preset', days: 90 }, NOW), false);
});

test('1주: 6일 전 아침은 들고 7일 전 밤은 빠진다(로컬 날짜 기준)', () => {
  const week: VisitRange = { kind: 'preset', days: 7 };
  assert.equal(inVisitRange(at(2026, 10, 11, 0), week, NOW), true);
  assert.equal(inVisitRange(at(2026, 10, 10, 23), week, NOW), false);
  assert.equal(inVisitRange(at(2026, 10, 17, 23), week, NOW), true);
});

test('custom 은 양 끝 날을 포함한다', () => {
  const r: VisitRange = { kind: 'custom', from: '2026-10-01', to: '2026-10-05' };
  assert.equal(inVisitRange(at(2026, 10, 1, 0), r, NOW), true);
  assert.equal(inVisitRange(at(2026, 10, 5, 23), r, NOW), true);
  assert.equal(inVisitRange(at(2026, 9, 30, 23), r, NOW), false);
  assert.equal(inVisitRange(at(2026, 10, 6, 0), r, NOW), false);
});

test('표기: 전체·preset·custom', () => {
  assert.equal(formatVisitRange({ kind: 'all' }, NOW), '전체');
  assert.equal(formatVisitRange({ kind: 'preset', days: 1 }, NOW), '오늘');
  assert.equal(formatVisitRange({ kind: 'preset', days: 7 }, NOW), '최근 1주');
  assert.equal(formatVisitRange({ kind: 'preset', days: 30 }, NOW), '최근 1달');
  assert.equal(formatVisitRange({ kind: 'preset', days: 90 }, NOW), '최근 3달');
  assert.equal(formatVisitRange({ kind: 'custom', from: '2026-10-01', to: '2026-10-17' }, NOW), '10월 1일 – 10월 17일');
  assert.equal(formatVisitRange({ kind: 'custom', from: '2026-10-03', to: '2026-10-03' }, NOW), '10월 3일');
});

test('표기: 올해가 아니면 연도를 붙인다', () => {
  assert.equal(
    formatVisitRange({ kind: 'custom', from: '2025-12-20', to: '2026-01-05' }, NOW),
    '2025년 12월 20일 – 2026년 1월 5일',
  );
});

const fields = [
  { id: 'a', status: 'pending' as const, recentVisitedAt: at(2026, 10, 16), categories: ['가로수'] },
  { id: 'b', status: 'done' as const, recentVisitedAt: at(2026, 8, 1), categories: ['공원'] },
  { id: 'c', status: 'in_progress' as const, recentVisitedAt: null, categories: [] },
];
const ids = (list: { id: string }[]) => list.map((f) => f.id);

test('필터 기본값은 전부 보인다(조치 상태 빈 배열 = 전체)', () => {
  const none = { statuses: [], range: { kind: 'all' } as VisitRange, tags: [] };
  assert.deepEqual(ids(filterMapFields(fields, none, NOW)), ['a', 'b', 'c']);
  assert.equal(hasMapFilter(none), false);
});

test('조치 상태를 고르면 고른 것만', () => {
  const f = { statuses: ['done', 'in_progress'] as const, range: { kind: 'all' } as VisitRange, tags: [] };
  assert.deepEqual(ids(filterMapFields(fields, { ...f, statuses: [...f.statuses] }, NOW)), ['b', 'c']);
  assert.equal(hasMapFilter({ ...f, statuses: [...f.statuses] }), true);
});

test('기간·분류는 함께 걸린다', () => {
  assert.deepEqual(ids(filterMapFields(fields, { statuses: [], range: { kind: 'preset', days: 7 }, tags: [] }, NOW)), ['a']);
  assert.deepEqual(ids(filterMapFields(fields, { statuses: [], range: { kind: 'preset', days: 90 }, tags: ['공원'] }, NOW)), ['b']);
});

test('체크인 시각 합치기: 늦은 쪽, 못 읽는 값은 버린다', async () => {
  const { laterIso } = await import('../../stores/checkInEvents');
  assert.equal(laterIso('2026-10-01T00:00:00Z', '2026-10-17T00:00:00Z'), '2026-10-17T00:00:00Z');
  assert.equal(laterIso('2026-10-17T00:00:00Z', '2026-10-01T00:00:00Z'), '2026-10-17T00:00:00Z');
  assert.equal(laterIso(null, '2026-10-01T00:00:00Z'), '2026-10-01T00:00:00Z');
  assert.equal(laterIso('2026-10-01T00:00:00Z', 'bad'), '2026-10-01T00:00:00Z');
});

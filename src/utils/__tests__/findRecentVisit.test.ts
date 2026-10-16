// 결과를 모르는 체크인 재전송 전 '이미 생긴 방문' 찾기 단위 테스트.
// 실행: npm test  (tsx --test — RN import 없는 순수 유틸만 대상)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKIN_CLOCK_SKEW_MS, findRecentVisit } from '../findRecentVisit';

const T0 = Date.parse('2026-10-17T05:00:00.000Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const MIN = 60 * 1000;

const timeline = [
  { visitId: 'old', fieldId: 'f1', visitedAt: at(-30 * MIN) },
  { visitId: 'other-field', fieldId: 'f2', visitedAt: at(5_000) },
  { visitId: 'mine', fieldId: 'f1', visitedAt: at(3_000) },
];

test('그 현장의, 처음 보낸 시각 이후 방문을 찾는다', () => {
  assert.equal(findRecentVisit(timeline, { fieldId: 'f1', attemptedAt: T0 })?.visitId, 'mine');
});

test('다른 현장 방문은 쓰지 않는다', () => {
  assert.equal(findRecentVisit(timeline, { fieldId: 'f3', attemptedAt: T0 }), null);
  assert.equal(findRecentVisit(timeline, { fieldId: 'f2', attemptedAt: T0 })?.visitId, 'other-field');
});

test('시계 차이 여유 안에서는 보낸 시각보다 조금 이른 방문도 찾는다', () => {
  const tl = [{ visitId: 'early', fieldId: 'f1', visitedAt: at(-90_000) }];
  assert.equal(findRecentVisit(tl, { fieldId: 'f1', attemptedAt: T0 })?.visitId, 'early');
  assert.ok(CHECKIN_CLOCK_SKEW_MS >= 90_000);
});

test('여유보다 이른 방문(앞선 다른 체크인)은 쓰지 않는다', () => {
  assert.equal(findRecentVisit([timeline[0]], { fieldId: 'f1', attemptedAt: T0 }), null);
  const tl = [{ visitId: 'early', fieldId: 'f1', visitedAt: at(-90_000) }];
  assert.equal(findRecentVisit(tl, { fieldId: 'f1', attemptedAt: T0, skewMs: MIN }), null);
});

test('여럿이면 보낸 시각에 가장 가까운 것', () => {
  const tl = [
    { visitId: 'later', fieldId: 'f1', visitedAt: at(10 * MIN) },
    { visitId: 'near', fieldId: 'f1', visitedAt: at(2_000) },
    { visitId: 'before', fieldId: 'f1', visitedAt: at(-60_000) },
  ];
  assert.equal(findRecentVisit(tl, { fieldId: 'f1', attemptedAt: T0 })?.visitId, 'near');
});

test('fieldId 가 없거나 시각이 깨진 항목, 빈 timeline 은 건너뛴다', () => {
  const tl = [
    { visitId: 'no-field', visitedAt: at(1_000) },
    { visitId: 'bad-time', fieldId: 'f1', visitedAt: 'not-a-date' },
  ];
  assert.equal(findRecentVisit(tl, { fieldId: 'f1', attemptedAt: T0 }), null);
  assert.equal(findRecentVisit(undefined, { fieldId: 'f1', attemptedAt: T0 }), null);
  assert.equal(findRecentVisit([], { fieldId: 'f1', attemptedAt: T0 }), null);
});

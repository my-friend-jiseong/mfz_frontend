// 정적 지도 카드 맞춤 레벨 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_MIN_LEVEL, circleExtremes, closestFitLevel } from '../cardMapFit';

test('점 하나(폭 0)면 가장 가까운 레벨', () => {
  assert.equal(closestFitLevel(0, 0, 8, 312, 90), CARD_MIN_LEVEL);
});

test('레벨 하나에 2배 — 들어가는 가장 가까운 레벨을 고른다', () => {
  // 레벨 8 에서 높이 351px: 10 이면 87.75(상자 90 안), 9 면 175.5(넘침)
  assert.equal(closestFitLevel(322, 351, 8, 312, 90), 10);
  assert.equal(closestFitLevel(322, 351, 8, 312, 86), 11);
});

test('다 안 들어가면 가장 넓은 레벨', () => {
  assert.equal(closestFitLevel(1e9, 1e9, 3, 100, 100), 14);
});

test('오차 원 끝점은 반지름만큼 떨어진다', () => {
  const [n, s, e, w] = circleExtremes({ lat: 35, lng: 129, radius: 100 });
  assert.ok(Math.abs((n.lat - s.lat) * 111320 - 200) < 1e-6);
  assert.ok(e.lng > 129 && w.lng < 129);
});

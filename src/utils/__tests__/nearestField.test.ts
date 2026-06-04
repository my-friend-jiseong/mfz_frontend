// Quick Photo 최근접 현장 매칭 단위 테스트 (계획 §7).
// 실행: npm test  (tsx --test — RN import 없는 순수 유틸만 대상)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findNearbyFields,
  formatDistanceM,
  QUICK_PHOTO_MAX_DISTANCE_M,
} from '../nearestField';

// haversineKm(EARTH_KM=6371) 기준 위도 1도 = 6371000·π/180 m.
// 순수 위도 오프셋이면 haversine 거리가 정확히 meters 가 되도록 역산.
const DEG_PER_METER = 180 / (Math.PI * 6371000);
const atMeters = (base: { lat: number; lng: number }, m: number) => ({
  latitude: base.lat + m * DEG_PER_METER,
  longitude: base.lng,
});

// 데모 데이터는 부산 기준 — 부산시청 좌표.
const HERE = { lat: 35.1798, lng: 129.075 };

test('임계값 이내 현장만 거리 오름차순으로 반환', () => {
  const f30 = { ...atMeters(HERE, 30), name: '부산시청 화단' };
  const f80 = { ...atMeters(HERE, 80), name: '연제구 가로수' };
  const f150 = { ...atMeters(HERE, 150), name: '거제동 점검' };
  const result = findNearbyFields(HERE, [f150, f80, f30]);
  assert.deepEqual(
    result.map((r) => r.field.name),
    ['부산시청 화단', '연제구 가로수'],
  );
  assert.ok(Math.abs(result[0].distanceM - 30) < 0.01);
  assert.ok(Math.abs(result[1].distanceM - 80) < 0.01);
});

test('임계값 경계 — 99m 포함, 101m 제외', () => {
  assert.equal(QUICK_PHOTO_MAX_DISTANCE_M, 100);
  const f99 = atMeters(HERE, 99);
  const f101 = atMeters(HERE, 101);
  assert.equal(findNearbyFields(HERE, [f99]).length, 1);
  assert.equal(findNearbyFields(HERE, [f101]).length, 0);
});

test('커스텀 임계값 적용', () => {
  const f200 = atMeters(HERE, 200);
  assert.equal(findNearbyFields(HERE, [f200], 300).length, 1);
  assert.equal(findNearbyFields(HERE, [f200], 100).length, 0);
});

test('빈 목록 → 빈 결과', () => {
  assert.deepEqual(findNearbyFields(HERE, []), []);
});

test('좌표 결측·비정상 현장은 제외 (크래시 금지)', () => {
  const bad1 = { latitude: NaN, longitude: 129.075 };
  const bad2 = { latitude: 35.1798, longitude: Infinity };
  const ok = atMeters(HERE, 10);
  const result = findNearbyFields(HERE, [bad1, bad2, ok]);
  assert.equal(result.length, 1);
  assert.equal(result[0].field, ok);
});

test('동률(같은 좌표) 다수도 모두 반환', () => {
  const a = { ...atMeters(HERE, 20), id: 'a' };
  const b = { ...atMeters(HERE, 20), id: 'b' };
  assert.equal(findNearbyFields(HERE, [a, b]).length, 2);
});

test('formatDistanceM — m 정수 / km 한 자리', () => {
  assert.equal(formatDistanceM(31.7), '32m');
  assert.equal(formatDistanceM(0.4), '0m');
  assert.equal(formatDistanceM(999.4), '999m');
  assert.equal(formatDistanceM(1234), '1.2km');
});

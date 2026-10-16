// 8-7 사진 위치별 묶기 단위 테스트. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignPhotoLocation, groupPhotos, uniqueTimes, type LocatedPhoto } from '../photoGroups';

// 위도만 옮기면 haversine 거리가 정확히 m 가 되게(nearestField.test 와 같은 방식).
const DEG_PER_METER = 180 / (Math.PI * 6371000);
const BASE = { lat: 35.1059, lng: 128.9668 }; // 부산 사하구 낙동대로 351
const north = (m: number) => ({ lat: BASE.lat + m * DEG_PER_METER, lng: BASE.lng });

const FIELD = { id: 'f351', latitude: BASE.lat, longitude: BASE.lng };
let t = 0;
const photo = (key: string, pos: { lat: number; lng: number } | null): LocatedPhoto => ({
  key,
  lat: pos?.lat ?? null,
  lng: pos?.lng ?? null,
  takenAt: new Date(Date.UTC(2025, 9, 14, 1, t++)).toISOString(),
});

test('100m 안 기존 현장은 그 현장 묶음, 나머지는 새 묶음, 위치 없는 사진은 따로', () => {
  t = 0;
  const { groups, unlocated } = groupPhotos(
    [photo('p1', north(20)), photo('p2', north(90)), photo('p3', north(500)), photo('p4', north(560)), photo('p5', null)],
    [FIELD],
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { key: 'field:f351', lat: BASE.lat, lng: BASE.lng, fieldId: 'f351', photoKeys: ['p1', 'p2'] });
  assert.equal(groups[1].fieldId, null);
  assert.deepEqual(groups[1].photoKeys, ['p3', 'p4']);
  assert.deepEqual(unlocated, ['p5']);
});

test('100m 경계: 100m 안은 같은 묶음, 밖은 따로', () => {
  t = 0;
  const a = groupPhotos([photo('a', north(1000)), photo('b', north(1099.9))], []);
  assert.equal(a.groups.length, 1);
  t = 0;
  const b = groupPhotos([photo('a', north(1000)), photo('b', north(1101.5))], []);
  assert.equal(b.groups.length, 2);
});

test('묶음 번호는 먼저 찍은 순서', () => {
  t = 0;
  const late = photo('late', north(800));
  const early = { ...photo('early', north(2000)), takenAt: '2025-01-01T00:00:00.000Z' };
  const { groups } = groupPhotos([late, early], []);
  assert.deepEqual(groups.map((g) => g.photoKeys[0]), ['early', 'late']);
});

test('기존 현장 근처 사진은 새 묶음보다 현장을 먼저 고른다', () => {
  t = 0;
  // p1 은 현장에서 150m(새 묶음), p2 는 p1 에서 60m 지만 현장에서 90m → 현장 묶음.
  const { groups } = groupPhotos([photo('p1', north(150)), photo('p2', north(90))], [FIELD]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find((g) => g.fieldId === 'f351')?.photoKeys, ['p2']);
});

test('지정한 위치가 묶음 100m 안이면 합치고 새 묶음을 만들지 않는다', () => {
  t = 0;
  const { groups } = groupPhotos([photo('p1', north(20)), photo('p3', north(500))], [FIELD]);
  const next = assignPhotoLocation(groups, 'p6', north(540), [FIELD]);
  assert.equal(next.length, 2);
  assert.deepEqual(next[1].photoKeys, ['p3', 'p6']);
  // 원래 목록은 바뀌지 않는다.
  assert.deepEqual(groups[1].photoKeys, ['p3']);
});

test('지정한 위치가 모든 묶음 100m 밖이면 새 묶음을 맨 뒤에(8-14)', () => {
  t = 0;
  const { groups } = groupPhotos([photo('p1', north(20)), photo('p3', north(500))], [FIELD]);
  const next = assignPhotoLocation(groups, 'p6', north(1500), [FIELD]);
  assert.equal(next.length, 3);
  assert.deepEqual(next[2], { key: 'new:p6', ...north(1500), fieldId: null, photoKeys: ['p6'] });
});

test('지정한 위치가 묶음 밖이지만 기존 현장 100m 안이면 그 현장 묶음을 새로 붙인다', () => {
  t = 0;
  const far = { id: 'far', latitude: north(3000).lat, longitude: BASE.lng };
  const { groups } = groupPhotos([photo('p1', north(20))], [FIELD, far]);
  const next = assignPhotoLocation(groups, 'p6', north(3050), [FIELD, far]);
  assert.equal(next.length, 2);
  assert.equal(next[1].fieldId, 'far');
  assert.equal(next[1].key, 'field:far');
});

test('지정한 위치가 새 묶음과 기존 현장 둘 다 100m 안이면 기존 현장이 먼저', () => {
  t = 0;
  // 새 묶음 p3 은 현장에서 150m. 지정 위치 90m 는 p3 에서 60m 지만 현장에서 90m → 현장 묶음.
  const { groups } = groupPhotos([photo('p3', north(150))], [FIELD]);
  const next = assignPhotoLocation(groups, 'p6', north(90), [FIELD]);
  assert.equal(next.length, 2);
  assert.deepEqual(next[1], { key: 'field:f351', lat: BASE.lat, lng: BASE.lng, fieldId: 'f351', photoKeys: ['p6'] });
  assert.deepEqual(next[0].photoKeys, ['p3']);
});

test('uniqueTimes: 같은 시각은 1ms 씩 민다', () => {
  const s = '2025-10-14T01:12:05.000Z';
  assert.deepEqual(uniqueTimes([s, s, s]), [s, '2025-10-14T01:12:05.001Z', '2025-10-14T01:12:05.002Z']);
});

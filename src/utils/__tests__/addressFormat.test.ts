import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionOf, districtOf, pickedPlaceName, placeCategoryLabel, shortJibun, sigunguOf, stripRegion } from '../addressFormat';

test('stripRegion: 시·도와 시·군·구를 뗀다', () => {
  assert.equal(stripRegion('부산 사하구 낙동대로 550'), '낙동대로 550');
  assert.equal(stripRegion('경기 수원시 장안구 정조로 1'), '정조로 1');
  assert.equal(stripRegion('낙동대로'), '낙동대로');
});

test('sigunguOf', () => {
  assert.equal(sigunguOf('부산 사하구 낙동대로 351'), '사하구');
  assert.equal(sigunguOf('경기 수원시 장안구 정조로 1'), '수원시 장안구');
});

test('shortJibun: 동 이하', () => {
  assert.equal(shortJibun('부산 사하구 당리동 343-1'), '당리동 343-1');
  assert.equal(shortJibun('부산 중구 남포동6가 1'), '남포동6가 1');
});

test('districtOf: 구와 동', () => {
  assert.equal(districtOf('부산 사하구 당리동 343-1'), '사하구 당리동');
  assert.equal(districtOf('부산 사하구 낙동대로 351'), '사하구');
});

test('pickedPlaceName', () => {
  assert.equal(pickedPlaceName('부산 사하구 당리동 312-7', ''), '당리동 312-7 부근');
  assert.equal(pickedPlaceName('', '부산 사하구 낙동대로 351'), '낙동대로 351 부근');
  assert.equal(pickedPlaceName('', ''), '선택한 위치');
});

test('placeCategoryLabel', () => {
  assert.equal(placeCategoryLabel('교육,학문 > 학교 > 초등학교'), '초등학교');
  assert.equal(placeCategoryLabel(undefined), '');
});

test('regionOf: 시·도와 시·군·구', () => {
  assert.deepEqual(regionOf('부산 사하구 낙동대로 351'), { sido: '부산', sigungu: '사하구' });
  assert.deepEqual(regionOf('낙동대로 351'), { sido: '', sigungu: '' });
});

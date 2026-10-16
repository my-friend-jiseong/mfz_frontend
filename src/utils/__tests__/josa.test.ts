// 조사(을/를) 단위 테스트(PR6 7-9 건너뛰기 스낵바). 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFinalConsonant, withObjectJosa, withTopicJosa } from '../josa';

test('한글 받침', () => {
  assert.equal(withObjectJosa('당리역'), '당리역을');
  assert.equal(withObjectJosa('사하구청 앞'), '사하구청 앞을');
  assert.equal(withObjectJosa('괴정로'), '괴정로를');
});

test('숫자로 끝나는 주소', () => {
  assert.equal(withObjectJosa('낙동대로 351'), '낙동대로 351을');
  assert.equal(withObjectJosa('하신중앙로 12'), '하신중앙로 12를');
  assert.equal(withObjectJosa('당리로 87'), '당리로 87을');
  assert.equal(withObjectJosa('괴정로 22'), '괴정로 22를');
  assert.equal(withObjectJosa('다대로 100'), '다대로 100을');
});

test('영문 끝', () => {
  assert.equal(withObjectJosa('Tower'), 'Tower를');
  assert.equal(withObjectJosa('Hotel'), 'Hotel을');
});

test('모르면 둘 다', () => {
  assert.equal(hasFinalConsonant(''), null);
  assert.equal(withObjectJosa('★'), '★을(를)');
});

test('은/는(9-12)', () => {
  assert.equal(withTopicJosa('당리로 87'), '당리로 87은');
  assert.equal(withTopicJosa('하신중앙로 12'), '하신중앙로 12는');
  assert.equal(withTopicJosa('★'), '★은(는)');
});

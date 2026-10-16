// 비밀번호 규칙 단위 테스트 — 회원가입(11-3)·새 비밀번호(11-12)·내 정보 수정(10-1)이 같은 문구를 쓰는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNewPassword, checkPasswordPolicy, PASSWORD_MESSAGES } from '../password';

test('10자 미만은 11-3 문구', () => {
  assert.equal(checkPasswordPolicy('abc123'), '10자 이상이어야 해요');
  assert.equal(checkPasswordPolicy(''), PASSWORD_MESSAGES.tooShort);
});

test('3가지 미만 조합·한글은 거부, 3가지 이상은 통과', () => {
  assert.equal(checkPasswordPolicy('abcdefghij'), PASSWORD_MESSAGES.kinds);
  assert.equal(checkPasswordPolicy('Abcdefgh1한'), PASSWORD_MESSAGES.hangul);
  assert.equal(checkPasswordPolicy('Abcdefgh12'), null);
  assert.equal(checkPasswordPolicy('abcdefg1!x'), null);
});

test('확인 칸이 다르면 11-12 문구, 같으면 오류 없음', () => {
  assert.deepEqual(checkNewPassword('Abcdefgh12', 'Abcdefgh13'), { confirm: '비밀번호가 서로 달라요' });
  assert.deepEqual(checkNewPassword('Abcdefgh12', 'Abcdefgh12'), {});
  assert.deepEqual(checkNewPassword('short', 'short'), { password: '10자 이상이어야 해요' });
});

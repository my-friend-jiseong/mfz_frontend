// 약관 동의 버전 페이로드 단위 테스트 (backend-backlog §30-D).
// 실행: npm test  (tsx --test — RN import 없는 순수 유틸만 대상)
//
// 지키려는 것: **배포되지 않은 문서에 동의했다는 기록을 만들지 않는다.**
// 동의 이력은 소급 수정이 불가능해서, 틀린 값이 한 번 쌓이면 되돌릴 방법이 없다.
// 아래 단언들은 LEGAL_DOCS 의 값이 바뀌어도(위치정보 약관이 배포돼도) 계속 유효하다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGAL_DOCS,
  LOCATION_TERMS_AVAILABLE,
  agreedTermsPayload,
  type LegalDocKey,
} from '../contact';

const keys = Object.keys(LEGAL_DOCS) as LegalDocKey[];
const deployed = keys.filter((k) => LEGAL_DOCS[k].effectiveDate !== null);

test('미배포 문서는 동의 페이로드에 실리지 않는다', () => {
  const payload = agreedTermsPayload() ?? {};
  for (const key of keys) {
    if (LEGAL_DOCS[key].effectiveDate === null) {
      assert.equal(
        payload[key],
        undefined,
        `${key} 는 배포되지 않았는데 동의 버전이 실렸다`,
      );
    }
  }
});

test('배포된 문서는 그 시행일 그대로 실린다', () => {
  const payload = agreedTermsPayload() ?? {};
  for (const key of deployed) {
    assert.equal(payload[key], LEGAL_DOCS[key].effectiveDate);
  }
  assert.equal(Object.keys(payload).length, deployed.length);
});

test('배포된 문서가 하나도 없으면 필드 자체를 보내지 않는다', () => {
  // 현재 상태 기준 회귀 가드 — 전부 null 이 되면 undefined 여야 한다.
  if (deployed.length === 0) {
    assert.equal(agreedTermsPayload(), undefined);
  } else {
    assert.notEqual(agreedTermsPayload(), undefined);
  }
});

test('시행일은 YYYY-MM-DD 이거나 null 이다', () => {
  for (const key of keys) {
    const d = LEGAL_DOCS[key].effectiveDate;
    if (d === null) continue;
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `${key} 시행일 형식이 아니다: ${d}`);
  }
});

test('위치정보 약관 노출 플래그는 시행일에서 파생된다', () => {
  // 별도 플래그로 손수 관리하면 페이지는 떴는데 메뉴가 꺼진 채로 남는다.
  assert.equal(
    LOCATION_TERMS_AVAILABLE,
    LEGAL_DOCS.location.effectiveDate !== null,
  );
});

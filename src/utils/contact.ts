// 문의 창구·정책 문서를 한 곳에 모은다.
// 흩어져 있던 탓에 로그인 화면만 죽은 도메인(ilgayo.kr)을 계속 가리키고 있었다 —
// 커밋 f079108 에서 약관 링크로 같은 사고가 났고, 그때 프로필 화면만 고쳐졌다.

// 실제 수신 중인 팀 주소. docs/REQUIREMENTS_BEFORE_LAUNCHING.md 와
// docs/일가요 서비스 운영 현황 확인 질문지.md 는 support@ilgayo.co.kr 를 적고 있지만,
// 그 수신함은 살아 있지 않다 — 2026-07-29 사용자 확인. 닿지 않는 주소를 심사용
// 공식 연락처로 노출하는 게 도메인 일관성보다 훨씬 나쁘다.
export const SUPPORT_EMAIL = 'myfriendjiseong@gmail.com';

/** 가입 화면이 필수 동의로 받는 문서 키 — 백엔드 `agreedTerms` 의 키와 같다. */
export type LegalDocKey = 'service' | 'privacy' | 'location';

interface LegalDoc {
  url: string;
  /**
   * **지금 그 URL 에서 실제로 서빙 중인 본문의 시행일** (`YYYY-MM-DD`).
   * `null` 이면 페이지가 아직 없다는 뜻이다.
   *
   * ⚠️ 노션 확정본의 시행일(2026-08-03)이 아니라 **배포된 것**을 적는다.
   * 사용자는 자기가 본 문서에 동의한 것이지 아직 배포되지 않은 문서에 동의한 게 아니다.
   * 여기에 앞선 날짜를 미리 적으면 **사실이 아닌 동의 이력**이 쌓인다 — 기록이 없는 것보다 나쁘다.
   * 백엔드가 새 본문을 배포하는 시점에 이 값을 함께 올린다(backend-backlog §30-B·§30-D).
   */
  effectiveDate: string | null;
}

/**
 * 정책 문서 단일 출처 — URL 과 "현재 배포된 시행일" 을 같이 들고 있는다.
 * 둘을 따로 두면 페이지는 떴는데 버전은 안 올라가는(또는 반대) 어긋남이 생긴다.
 *
 * 2026-07-29 실측:
 * - `/terms`·`/privacy` → 200, 본문 시행일 **2026-06-18** (구 초안, `src/legal/registerLegalRoutes.js` 하드코딩)
 * - `/location-terms` → **404** (페이지 자체가 없다)
 */
export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  service: { url: 'https://ilgayo.co.kr/terms', effectiveDate: '2026-06-18' },
  privacy: { url: 'https://ilgayo.co.kr/privacy', effectiveDate: '2026-06-18' },
  location: { url: 'https://ilgayo.co.kr/location-terms', effectiveDate: null },
};

export const TERMS_URL = LEGAL_DOCS.service.url;
export const PRIVACY_URL = LEGAL_DOCS.privacy.url;
export const LOCATION_TERMS_URL = LEGAL_DOCS.location.url;

/**
 * 위치정보 이용약관 메뉴 노출 여부 — **페이지가 실제로 있을 때만** 켠다.
 * 심사 대상 앱에서 404 로 가는 정책 링크는 없느니만 못하다(f079108 의 교훈).
 * 별도 플래그로 두지 않고 시행일에서 파생시킨다 — 손으로 관리하면 둘이 어긋난다.
 */
export const LOCATION_TERMS_AVAILABLE: boolean =
  LEGAL_DOCS.location.effectiveDate !== null;

/**
 * 가입 시 서버에 보낼 동의 버전 (backend-backlog §30-D).
 *
 * **배포된 문서만 싣는다.** 아직 없는 문서(`effectiveDate === null`)를 빼는 이유는,
 * 존재하지 않는 문서에 동의했다는 기록이 남으면 안 되기 때문이다. 가입 화면이 위치정보
 * 약관을 체크로 받고는 있지만 링크는 일반 `/terms` 를 가리키는 상태라(§30-B 대기),
 * 지금 `location` 을 실으면 사용자가 본 적 없는 문서를 동의한 것으로 기록하게 된다.
 *
 * 전부 미배포면 `undefined` 를 돌려줘 필드 자체를 빼도록 한다.
 */
export function agreedTermsPayload(): Partial<Record<LegalDocKey, string>> | undefined {
  const entries = (Object.keys(LEGAL_DOCS) as LegalDocKey[])
    .map((key) => [key, LEGAL_DOCS[key].effectiveDate] as const)
    .filter((pair): pair is readonly [LegalDocKey, string] => pair[1] !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Partial<Record<LegalDocKey, string>>;
}

/** 문의 메일 — 제목을 미리 채워 운영팀이 분류할 수 있게 한다. */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

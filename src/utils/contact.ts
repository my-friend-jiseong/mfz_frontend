// 문의 창구·정책 페이지 주소를 한 곳에 모은다.
// 흩어져 있던 탓에 로그인 화면만 죽은 도메인(ilgayo.kr)을 계속 가리키고 있었다 —
// 커밋 f079108 에서 약관 링크로 같은 사고가 났고, 그때 프로필 화면만 고쳐졌다.

// 실제 수신 중인 팀 주소. docs/REQUIREMENTS_BEFORE_LAUCHING.md 와
// docs/일가요 서비스 운영 현황 확인 질문지.md 는 support@ilgayo.co.kr 를 적고 있지만,
// 그 수신함은 살아 있지 않다 — 2026-07-29 사용자 확인. 닿지 않는 주소를 심사용
// 공식 연락처로 노출하는 게 도메인 일관성보다 훨씬 나쁘다.
export const SUPPORT_EMAIL = 'myfriendjiseong@gmail.com';

/** 정책 정적 페이지 — 백엔드 backlog §23 로 배포됨(2026-07-29 실측 200). 본문은 아직 초안. */
export const TERMS_URL = 'https://ilgayo.co.kr/terms';
export const PRIVACY_URL = 'https://ilgayo.co.kr/privacy';

/**
 * 위치정보 이용약관.
 *
 * ⚠️ **아직 존재하지 않는다.** 2026-07-29 실측: `/location-terms`·`/location`·`/terms/location`
 * 모두 404 이고, `/terms`·`/privacy` 본문에도 '위치정보' 문구가 없다.
 * 그래서 프로필 메뉴에 **노출하지 않는다** — 심사 대상 앱에서 404 로 가는 정책 링크는
 * 없느니만 못하다(f079108 의 교훈).
 *
 * 백엔드 backlog §30 으로 페이지를 요청해 뒀다. 페이지가 뜨면
 * `LOCATION_TERMS_AVAILABLE` 만 true 로 바꾸면 메뉴가 켜진다.
 */
export const LOCATION_TERMS_URL = 'https://ilgayo.co.kr/location-terms';
// 타입을 boolean 으로 넓혀 둔다 — literal `false` 로 좁혀지면 소비처의 분기가
// '항상 거짓' 으로 취급돼 도구가 죽은 코드로 신고한다. 켜는 건 이 값 한 줄이면 된다.
export const LOCATION_TERMS_AVAILABLE: boolean = false;

/** 문의 메일 — 제목을 미리 채워 운영팀이 분류할 수 있게 한다. */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

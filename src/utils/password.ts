// 비밀번호 정책 — 회원가입(app/(auth)/signup.tsx)과 프로필 비밀번호 변경(§15)이 공유한다.
// 두 화면이 서로 다른 규칙을 쓰면 "가입은 됐는데 변경은 거부" 같은 모순이 생긴다.
//
// 백엔드 정책: 10자 이상 + 영대/영소/숫자/특수문자 중 3종 이상.
// (2026-07-26 백엔드 결과보고서는 "현재 최소 8자" 라고 적었지만, 프론트는 더 엄격한 쪽을
//  유지한다 — 클라이언트가 더 빡센 건 항상 안전하고, 완화는 백엔드 실측 후에 해도 늦지 않다.)

export const PASSWORD_HINT = '10자 이상 · 영대/영소/숫자/특수문자 중 3종 이상 조합';

/** 통과하면 null, 위반이면 사용자에게 보여줄 한국어 사유. */
export function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 10) return '비밀번호는 10자 이상이어야 합니다';
  // 한글은 4종 어디에도 매칭되지 않음 — 백엔드가 거부할 가능성 높아 명시적 안내.
  if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(pw)) {
    return '비밀번호에 한글은 사용할 수 없습니다';
  }
  let kinds = 0;
  if (/[A-Z]/.test(pw)) kinds++;
  if (/[a-z]/.test(pw)) kinds++;
  if (/[0-9]/.test(pw)) kinds++;
  if (/[^A-Za-z0-9]/.test(pw)) kinds++;
  if (kinds < 3) return '영대/영소/숫자/특수문자 중 3종 이상을 조합해주세요';
  return null;
}

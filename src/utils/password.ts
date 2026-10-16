// 비밀번호 정책 — 회원가입(11-2)·내 정보 수정(10-1)·새 비밀번호(11-8)가 공유한다.
// 화면마다 다른 규칙을 쓰면 "가입은 됐는데 변경은 거부" 같은 모순이 생긴다.
//
// 백엔드 정책: 10자 이상 + 영대/영소/숫자/특수문자 중 3종 이상.
// (2026-07-26 백엔드 결과보고서는 "현재 최소 8자" 라고 적었지만, 프론트는 더 엄격한 쪽을
//  유지한다 — 클라이언트가 더 빡센 건 항상 안전하고, 완화는 백엔드 실측 후에 해도 늦지 않다.)
//
// 문구는 2차 11-3·11-12(Figma) 기준 '-해요'체. 칸 아래 빨간 줄에 그대로 쓴다.

export const PASSWORD_HINT = '10자 이상, 영문 대문자·소문자·숫자·특수문자 중 3가지 이상';

export const PASSWORD_MESSAGES = {
  tooShort: '10자 이상이어야 해요',
  hangul: '한글은 쓸 수 없어요',
  kinds: '영문 대문자·소문자·숫자·특수문자 중 3가지 이상 섞어야 해요',
  mismatch: '비밀번호가 서로 달라요',
} as const;

/** 통과하면 null, 위반이면 칸 아래에 보여 줄 사유. */
export function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 10) return PASSWORD_MESSAGES.tooShort;
  // 한글은 4종 어디에도 매칭되지 않음 — 백엔드가 거부할 가능성 높아 명시적 안내.
  if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(pw)) return PASSWORD_MESSAGES.hangul;
  let kinds = 0;
  if (/[A-Z]/.test(pw)) kinds++;
  if (/[a-z]/.test(pw)) kinds++;
  if (/[0-9]/.test(pw)) kinds++;
  if (/[^A-Za-z0-9]/.test(pw)) kinds++;
  if (kinds < 3) return PASSWORD_MESSAGES.kinds;
  return null;
}

/** 새 비밀번호 + 확인 칸 검사. 오류가 있는 칸만 키가 생긴다. */
export function checkNewPassword(pw: string, confirm: string): { password?: string; confirm?: string } {
  const out: { password?: string; confirm?: string } = {};
  const policy = checkPasswordPolicy(pw);
  if (policy) out.password = policy;
  if (confirm !== pw) out.confirm = PASSWORD_MESSAGES.mismatch;
  return out;
}

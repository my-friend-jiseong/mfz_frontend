// 이름 뒤 조사(을/를) — '낙동대로 351을 건너뛰었어요'(7-9). 이름이 숫자로 끝나면 읽는 소리로 받침을 정한다
// (1 일·3 삼·6 육·7 칠·8 팔·0 십/백/천 은 받침, 2 이·4 사·5 오·9 구 는 받침 없음).

const DIGIT_HAS_FINAL: Record<string, boolean> = {
  '0': true,
  '1': true,
  '2': false,
  '3': true,
  '4': false,
  '5': false,
  '6': true,
  '7': true,
  '8': true,
  '9': false,
};

// 영문은 끝 글자 소리로 대강(l·m·n 과 b·k·p·t 은 받침, r 은 받침 없음 — 'tower를').
const LATIN_HAS_FINAL = /[lmnbkpt]$/i;

/** 끝 글자에 받침이 있는가. 판단할 수 없으면 null. */
export function hasFinalConsonant(word: string): boolean | null {
  const s = word.trim().replace(/[\s)\]}'"’”.,·-]+$/u, '');
  if (!s) return null;
  const last = s[s.length - 1];
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (last in DIGIT_HAS_FINAL) return DIGIT_HAS_FINAL[last];
  if (/[a-z]/i.test(last)) return LATIN_HAS_FINAL.test(s);
  return null;
}

/** '낙동대로 351' → '낙동대로 351을', '하신중앙로 12' → '하신중앙로 12를'. 모르면 '을(를)'. */
export function withObjectJosa(word: string): string {
  const f = hasFinalConsonant(word);
  if (f === null) return `${word}을(를)`;
  return `${word}${f ? '을' : '를'}`;
}

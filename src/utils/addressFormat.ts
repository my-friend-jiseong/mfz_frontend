// 2차 현장 화면의 주소 줄임 규칙(4-1 결과 행, 5 현장 상세 부제, 4-3 선택한 위치).
// RN/expo import 없는 순수 모듈 — node 단위 테스트 대상(src/utils/__tests__/addressFormat.test.ts).

// 시·도 다음의 시·군·구 토큰(수원시 장안구처럼 둘일 수 있다).
const SIGUNGU = /(시|군|구)$/;
// 동·읍·면·리·가(지번 주소의 동네 이름). '1가' 같은 숫자 가는 동 뒤에 붙으므로 함께 둔다.
const DONG = /(동|읍|면|리|가|\d+가)$/;

function tokens(address: string): string[] {
  return address.trim().split(/\s+/).filter(Boolean);
}

/** 시·도와 시·군·구를 뗀 주소. '부산 사하구 낙동대로 550' → '낙동대로 550'. */
export function stripRegion(address: string): string {
  const t = tokens(address);
  if (t.length <= 1) return address.trim();
  let i = 1; // 첫 토큰은 시·도
  while (i < t.length - 1 && SIGUNGU.test(t[i])) i++;
  return t.slice(i).join(' ');
}

/** 시·군·구(들). '부산 사하구 낙동대로 351' → '사하구'. 없으면 ''. */
export function sigunguOf(address: string): string {
  const t = tokens(address);
  const out: string[] = [];
  for (let i = 1; i < t.length - 1 && SIGUNGU.test(t[i]); i++) out.push(t[i]);
  return out.join(' ');
}

/** 주소 글의 시·도와 시·군·구. '부산 사하구 낙동대로 351' → { sido: '부산', sigungu: '사하구' }. 모르면 ''. */
export function regionOf(address: string): { sido: string; sigungu: string } {
  const t = tokens(address);
  const sigungu = sigunguOf(address);
  return { sido: sigungu && t.length > 1 ? t[0] : '', sigungu };
}

/** 지번 주소의 동 이하. '부산 사하구 당리동 343-1' → '당리동 343-1'. */
export function shortJibun(jibun: string): string {
  const t = tokens(jibun);
  const i = t.findIndex((x, idx) => idx > 0 && DONG.test(x) && !SIGUNGU.test(x));
  return i >= 0 ? t.slice(i).join(' ') : stripRegion(jibun);
}

/** 구와 동. '부산 사하구 당리동 343-1' → '사하구 당리동'. 동을 못 찾으면 구만. */
export function districtOf(jibunOrRoad: string): string {
  const t = tokens(jibunOrRoad);
  const gu = sigunguOf(jibunOrRoad);
  const dong = t.find((x, idx) => idx > 0 && DONG.test(x) && !SIGUNGU.test(x) && !/\d/.test(x.replace(/\d+가$/, '')));
  return [gu, dong].filter(Boolean).join(' ');
}

/** 4-3 길게 눌러 고른 위치의 이름. '부산 사하구 당리동 312-7' → '당리동 312-7 부근'. */
export function pickedPlaceName(jibun: string, road: string): string {
  const base = jibun ? shortJibun(jibun) : stripRegion(road);
  return base ? `${base} 부근` : '선택한 위치';
}

/** 카카오 장소 분류 'category_name' 의 마지막 칸. '교육,학문 > 학교 > 초등학교' → '초등학교'. */
export function placeCategoryLabel(categoryName: string | undefined | null): string {
  if (!categoryName) return '';
  const parts = categoryName.split('>').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

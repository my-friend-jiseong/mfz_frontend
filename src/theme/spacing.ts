// 간격 tier — 값을 눈대중으로 고르지 않는다. "무엇과 무엇 사이인가" 로 토큰이 정해진다.
//   xs (4)   micro     아이콘 ↔ 라벨, 배지 내부
//   sm (8)   inner     한 덩어리 안의 줄 사이, 목록 항목 사이
//   md (12)  component 카드 내부 블록 사이
//   lg (16)  group     카드 패딩, 카드 ↔ 카드
//   xl (24)  section   그룹 ↔ 그룹
//   xxl (32) major     영역 ↔ 영역, 화면 상하 끝
//
// 리듬은 불균등해야 한다 — 같은 그룹 안은 sm, 그룹 사이는 xl. 전부 lg 로 균일하면
// 무엇이 한 덩어리인지 눈이 못 읽는다. (별도 alias export 는 두지 않는다 — 토큰은 하나)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// 최소 터치 타깃. **값이 두 개인 건 결정이다** — 44 와 48 이 섞여 있는 걸 감사에서 발견하고
// 실측해보니 눈대중이 아니라 종류별로 갈려 있었다(2026-07-30, 6 callsite):
//   control(44) — 인라인 컨트롤: 버튼·헤더 액션·건너뛰기. WCAG 2.5.5 / Direction '밀도' 항목.
//   row(48)     — 전폭 행·입력란: 목록 행·동의 체크박스 행·폼 필드. Android 목록 권장 48dp.
// 규칙이 없던 게 아니라 적혀 있지 않았을 뿐이라, 값을 하나로 합치지 않고 이름을 붙였다.
export const touchTarget = { control: 44, row: 48 } as const;

// 목록 콘텐츠 하단 여백. tier 가 아니라 **무엇을 피하는가** 로 정해지는 값이라
// spacing 과 분리한다 — 탭바(56) + FAB·부유 chrome 뒤로 마지막 항목이 숨지 않게 한다.
// 이 값이 5 화면에 `120` 으로 흩어져 있었다: 반복되는 매직넘버는 없는 토큰이다.
// (`trips/active` 는 시트 래퍼 높이 때문에 240 이 필요하다 — 그 파일 ★ 주석에 실측 근거가
//  있고 계산이 다르므로 이 토큰으로 묶지 않는다.)
export const listBottomInset = 120;

// concentric radius — 둥근 자식이 둥근 부모 안에 8px 이하로 inset 될 때만
// `자식 = 부모 − inset`. (예: md(10) 컨테이너 + xs(4) 패딩 → 자식 sm(6))
// inset 이 그보다 크면 두 모서리가 시각적으로 연결되지 않으므로 규칙이 걸리지 않는다.
export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

// React Native lineHeight 는 px. fontSize 와 1:1 매핑되는 standard line-height.
export const lineHeight = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 26,
  xl: 30,
  xxl: 36,
} as const;

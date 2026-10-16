import type { TextStyle, ViewStyle } from 'react-native';
import { palette } from './palette';
import { fontFamily } from './typography';

// 2차 개선본 토큰 — Figma 변수 `2차 · Color`·`2차 · Spacing`·`2차 · Radius`, 텍스트 스타일 `2차/…`,
// 효과 스타일 `2차/Elevation/…` 를 그대로 옮긴다(2026-10-16 get_variable_defs 기준).
//
// 기존 `colors`·`radius`·`typography`·`elevation` 와 따로 둔다. 이름이 같은데 값이 다른 것이 있어서
// (radius sm 6↔10, bg canvas slate50↔white, text inverse slate50↔white 등) 한 객체에 합치면
// 아직 옮기지 않은 화면이 조용히 바뀐다. 화면을 2차로 옮길 때 이 파일 토큰으로 바꾼다.
// hex 는 palette 에서만 가져온다.

export const c2 = {
  text: {
    primary: palette.slate[900],
    body: palette.slate[700],
    secondary: palette.slate[600],
    tertiary: palette.slate[500],
    disabled: palette.slate[400],
    inverse: palette.white,
    brand: palette.blue[700],
    link: palette.blue[600],
    danger: palette.red[700],
    // 확인 창 빨간 경고 상자 글자(3-6). Figma 에 변수 없이 hex 로 박혀 있어 이름만 붙였다.
    dangerStrong: palette.red[800],
    warning: palette.amber[700],
    success: palette.green[700],
    inverseAccent: palette.blue[300],
  },
  bg: {
    canvas: palette.white,
    subtle: palette.slate[50],
    muted: palette.slate[100],
    placeholder: palette.slate[200],
    strong: palette.slate[300],
    brand: palette.blue[600],
    brandSubtle: palette.blue[50],
    dangerSubtle: palette.red[50],
    successSubtle: palette.green[50],
    warningSubtle: palette.amber[50],
    inverse: palette.slate[800],
    ink: palette.slate[900],
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
  border: {
    default: palette.slate[200],
    subtle: palette.slate[100],
    strong: palette.slate[300],
    mutedStrong: palette.slate[400],
    brand: palette.blue[600],
    brandMuted: palette.blue[300],
    brandSubtle: palette.blue[200],
    inverse: palette.white,
  },
  // 현장 조치 상태(색+모양 3중 인코딩) · 방문함(회색 핀) · 새 현장(검은 핀)
  status: {
    pending: palette.amber[600],
    inProgress: palette.blue[600],
    done: palette.green[600],
    visited: palette.slate[400],
    new: palette.slate[900],
  },
  danger: palette.red[600],
  // GPS 오차 원(8-12)·선택 핀 바닥 그림자 — Figma 프레임에 투명도 hex 로만 있는 값.
  accuracy: {
    fill: 'rgba(217, 119, 6, 0.10)',
    stroke: 'rgba(180, 83, 9, 0.55)',
  },
} as const;

export type C2TextTone = keyof typeof c2.text;

// `2차 · Spacing` space/2 … space/32. 키가 곧 px 값이다(space[12] = 12).
export const space = {
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
} as const;

// size/touch-min. 누르는 요소의 터치 범위는 48 이상(보이는 크기는 작아도 됨) — Touchable 이 hitSlop 으로 채운다.
export const touchMin = 48;

// `2차 · Radius`. 기존 `radius`(sm 6 / md 10 / lg 16)와 이름이 겹쳐 값이 다르므로 따로 둔다.
export const radius2 = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 999,
} as const;

// === 텍스트 스타일 27종 (`2차/…`) ===
type W = 'regular' | 'semibold' | 'bold' | 'heavy';
const WEIGHT: Record<W, TextStyle['fontWeight']> = {
  regular: '400',
  semibold: '600',
  bold: '700',
  heavy: '800',
};
const t = (size: number, lineHeight: number, w: W, letterSpacing = -0.2): TextStyle => ({
  fontFamily: fontFamily[w],
  fontWeight: WEIGHT[w],
  fontSize: size,
  lineHeight,
  letterSpacing,
});

export const type2 = {
  // 11 로그인의 '일가요' 글자 로고. 텍스트 스타일 없이 36 ExtraBold 로 박혀 있다.
  logo: t(36, 44, 'heavy', -1),
  // 10 내 정보 아바타(60) 안 이니셜. 텍스트 스타일 없이 26 ExtraBold 로 박혀 있다.
  avatar: t(26, 32, 'heavy', -0.5),
  display: t(28, 36, 'heavy', -0.8),
  'title.l': t(22, 30, 'heavy', -0.5),
  'title.m': t(20, 28, 'heavy', -0.4),
  'title.s': t(19, 27, 'heavy', -0.4),
  'title.xs': t(18, 26, 'heavy', -0.3),
  heading: t(18, 26, 'bold', -0.3),
  button: t(17, 24, 'bold'),
  'bodyL.bold': t(16, 22, 'bold'),
  'bodyL.semibold': t(16, 22, 'semibold'),
  'bodyL.regular': t(16, 22, 'regular'),
  'bodyM.extrabold': t(15, 22, 'heavy'),
  'bodyM.bold': t(15, 22, 'bold'),
  'bodyM.semibold': t(15, 22, 'semibold'),
  'bodyM.regular': t(15, 22, 'regular'),
  'bodyS.extrabold': t(14, 20, 'heavy'),
  'bodyS.bold': t(14, 20, 'bold'),
  'bodyS.semibold': t(14, 20, 'semibold'),
  'bodyS.regular': t(14, 20, 'regular'),
  // 3-8 경로 순서 카드의 순번 원 숫자. Figma 에 텍스트 스타일 없이 13 ExtraBold 로 박혀 있다.
  'caption.extrabold': t(13, 18, 'heavy'),
  // 11-5 인증번호 칸 숫자. 텍스트 스타일 없이 24 Bold 로 박혀 있다.
  'code.digit': t(24, 32, 'bold'),
  'caption.bold': t(13, 18, 'bold'),
  'caption.semibold': t(13, 18, 'semibold'),
  'caption.regular': t(13, 18, 'regular'),
  'small.bold': t(12, 16, 'bold'),
  'small.semibold': t(12, 16, 'semibold'),
  'small.regular': t(12, 16, 'regular'),
  'micro.bold': t(11, 16, 'bold'),
  'micro.semibold': t(11, 16, 'semibold'),
  tiny: t(10, 15, 'semibold'),
} as const satisfies Record<string, TextStyle>;

export type Type2 = keyof typeof type2;

// === 그림자 8종 (`2차/Elevation/…`) ===
// 두 겹·브랜드 색이 있어 shadowColor/shadowOpacity 한 벌로는 못 옮긴다. RN 0.81 New Arch 의
// `boxShadow`(CSS 문법, 여러 겹·색 지원)를 쓴다. 웹은 react-native-web 이 CSS 로 그대로 넘긴다.
// Android 는 New Arch 에서만 그려진다(Expo Go 54 는 New Arch) — 실기기 확인 목록에 있음.
// Figma 의 radius 는 CSS blur 와 같은 뜻이다.
export const shadowCss = {
  control: '0px 1px 2px rgba(15, 23, 42, 0.10), 0px 4px 14px rgba(15, 23, 42, 0.10)',
  sheet: '0px -6px 20px rgba(15, 23, 42, 0.12)',
  popover: '0px 4px 12px rgba(15, 23, 42, 0.10), 0px 12px 32px rgba(15, 23, 42, 0.14)',
  dialog: '0px 12px 40px rgba(15, 23, 42, 0.25)',
  snackbar: '0px 6px 20px rgba(15, 23, 42, 0.28)',
  pin: '0px 1px 1.2px rgba(15, 23, 42, 0.45), 0px 3px 5px rgba(15, 23, 42, 0.18)',
  brandCta: '0px 6px 16px rgba(37, 99, 235, 0.28)',
  fab: '0px 2px 4px rgba(37, 99, 235, 0.25), 0px 8px 20px rgba(37, 99, 235, 0.32)',
  // 효과 스타일은 아니지만 Figma 프레임에 박힌 값: 지도 카드 [크게 보기] 알약(5·8).
  chip: '0px 2px 8px rgba(15, 23, 42, 0.10), 0px 1px 2px rgba(15, 23, 42, 0.12)',
  // 작은 목적지 버튼(44)의 흰 배지.
  badge: '0px 2px 6px rgba(15, 23, 42, 0.18)',
} as const;

export type Elevation2 = keyof typeof shadowCss;

export const elevation2: Record<Elevation2, ViewStyle> = Object.fromEntries(
  Object.entries(shadowCss).map(([k, v]) => [k, { boxShadow: v }]),
) as Record<Elevation2, ViewStyle>;

// 지도 WebView(HTML) 핀용 — SVG 에는 box-shadow 가 안 먹으므로 filter: drop-shadow 로 같은 두 겹을 낸다.
export const pinShadowFilterCss =
  'drop-shadow(0px 1px 1.2px rgba(15,23,42,0.45)) drop-shadow(0px 3px 5px rgba(15,23,42,0.18))';

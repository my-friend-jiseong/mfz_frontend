import type { TextStyle } from 'react-native';
import { fontSize, fontWeight, lineHeight } from './spacing';

// Pretendard 폰트 패밀리. useFonts 로 로드된 키와 일치해야 함.
// iOS 는 fontFamily 가 weight 를 포함하므로 별도 fontFamily 권장,
// Android 는 fontWeight + family 둘 다 본 후 적절한 폰트를 선택.
export const fontFamily = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  heavy: 'Pretendard-ExtraBold',
} as const;

// composite typography tokens — 페이지 제목 / 중형 제목 / 소형 제목 / 본문 / 캡션 위계.
// 사용처: <Text style={typography.h1}>...</Text> 또는 styles 안에 ...typography.body
//
// 디자인 시스템 매핑 (docs/image.png 의 예시):
//   페이지 제목  → h1     (xxl + heavy)
//   중형 제목    → h2     (xl + bold)
//   소형 제목    → h3     (lg + bold)
//   본문         → body   (base + regular)
//   캡션/주석/출처 → caption (xs + regular, muted color 권장)
export const typography = {
  h1: {
    fontFamily: fontFamily.heavy,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.heavy,
    lineHeight: lineHeight.xxl,
  } satisfies TextStyle,
  h2: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.xl,
  } satisfies TextStyle,
  h3: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.lg,
  } satisfies TextStyle,
  bodyLg: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.lg,
  } satisfies TextStyle,
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.base,
  } satisfies TextStyle,
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.sm,
  } satisfies TextStyle,
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.xs,
  } satisfies TextStyle,
  // 강조는 Text 컴포넌트의 weight prop 로 일관 적용 — bodyBold/bodySmBold/captionBold
  // 토큰은 정의했었으나 callsite 0 + Variant union 미노출이라 dead. 제거.
} as const;

// useFonts 에 넘길 폰트 맵. 키는 fontFamily 값과 일치.
// otf 파일을 require 로 로드 (Metro 가 asset 으로 처리).
export const FONTS_TO_LOAD = {
  'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
  'Pretendard-ExtraBold': require('../../assets/fonts/Pretendard-ExtraBold.otf'),
} as const;

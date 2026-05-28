import {
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { typography, fontFamily } from '@/theme/typography';
import { fontWeight } from '@/theme/spacing';
import { colors } from '@/theme/colors';

type Variant = 'h1' | 'h2' | 'h3' | 'bodyLg' | 'body' | 'bodySm' | 'caption';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';
type ColorKey =
  | 'text'
  | 'textMuted'
  | 'textSubtle'
  | 'textDisabled'
  | 'textInverse'
  | 'textLink'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'accent'
  | 'onPrimary'
  | 'onDanger';

interface Props extends RNTextProps {
  variant?: Variant;
  weight?: Weight;
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
}

const COLOR_MAP: Record<ColorKey, string> = {
  text: colors.text,
  textMuted: colors.textMuted,
  textSubtle: colors.textSubtle,
  textDisabled: colors.textDisabled,
  textInverse: colors.textInverse,
  textLink: colors.textLink,
  primary: colors.primary,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  info: colors.info,
  accent: colors.accent,
  onPrimary: colors.onPrimary,
  onDanger: colors.onDanger,
};

// 디자인 시스템 typography composite + semantic color 일괄 적용.
// 사용 예:
//   <Text variant="h1">제목</Text>
//   <Text variant="body" color="textMuted">본문</Text>
//   <Text variant="caption" weight="bold">강조 캡션</Text>
//
// 기존 RN Text 직접 사용은 그대로 동작 (Pretendard defaultProps 적용),
// 이 컴포넌트는 위계 변경 시 1 곳만 수정하면 되는 자리.
export function Text({
  variant = 'body',
  weight,
  color = 'text',
  align,
  style,
  ...rest
}: Props) {
  const base = typography[variant];
  const weightOverride: TextStyle | null = weight
    ? { fontFamily: fontFamily[weight], fontWeight: fontWeight[weight] }
    : null;
  return (
    <RNText
      {...rest}
      style={[
        base,
        weightOverride,
        { color: COLOR_MAP[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

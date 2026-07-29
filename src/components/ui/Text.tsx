import {
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { typography, fontFamily } from '@/theme/typography';
import { fontWeight } from '@/theme/spacing';
import { colors } from '@/theme/colors';

type Variant = keyof typeof typography;
type Weight = keyof typeof fontFamily;

// Text 의 color prop 으로 허용하는 colors 키 — semantic foreground 만.
// 새 키 추가 시 colors.ts 갱신 후 이 union 만 한 줄 추가 (lookup 은 colors[color] 직접).
type ColorKey =
  | 'text'
  | 'textMuted'
  | 'textSubtle'
  | 'textInverse'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'onPrimary'
  | 'onDanger';

interface Props extends RNTextProps {
  variant?: Variant;
  weight?: Weight;
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
  // 변하는 숫자(카운트·진행률·시각·거리)에 tabular-nums. 자릿수가 바뀌어도 폭이 안 흔들린다.
  // metric/metricSm variant 는 이미 포함하므로 그 외 variant 에 숫자가 섞일 때만 쓴다.
  numeric?: boolean;
}

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

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
  numeric,
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
        { color: colors[color] },
        align ? { textAlign: align } : null,
        numeric ? TABULAR : null,
        style,
      ]}
    />
  );
}

import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// Depth 전략: 문서 흐름 안의 표면은 '테두리' 하나로만 위계를 만든다.
// 그림자(elevation)는 지도 위에 떠 있는 chrome 전용 — 두 전략을 섞지 않는다.
// 'elevated' variant 는 callsite 0 인 채로 이 규칙과 어긋나 있어 제거했다.
type Padding = 'none' | 'sm' | 'md' | 'lg';
type Variant = 'outline' | 'flat';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  padding?: Padding;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  // onPress 있을 때 screen reader 에 읽힐 라벨. 미지정 시 children 의 Text 가 자동 합성.
  accessibilityLabel?: string;
}

const PADDING: Record<Padding, number> = {
  none: 0,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

export function Card({
  children,
  onPress,
  padding = 'lg',
  variant = 'outline',
  style,
  accessibilityLabel,
}: Props) {
  const base: StyleProp<ViewStyle>[] = [
    styles.base,
    { padding: PADDING[padding] },
  ];

  if (variant === 'outline') {
    base.push({ borderWidth: 1, borderColor: colors.border });
  }

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        ...base,
        pressed && { opacity: opacity.pressed },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
});

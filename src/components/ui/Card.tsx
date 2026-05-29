import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { opacity } from '@/theme/motion';

type Padding = 'none' | 'sm' | 'md' | 'lg';
type Variant = 'outline' | 'elevated' | 'flat';

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
  } else if (variant === 'elevated') {
    base.push(elevation.card);
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

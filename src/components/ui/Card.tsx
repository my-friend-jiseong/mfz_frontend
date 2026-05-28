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

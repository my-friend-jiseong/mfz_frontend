import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: IonName;
  rightIcon?: IonName;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const VARIANT: Record<
  ButtonVariant,
  { container: ViewStyle; text: TextStyle; tint: string }
> = {
  primary: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.onPrimary },
    tint: colors.onPrimary,
  },
  secondary: {
    container: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: { color: colors.text },
    tint: colors.text,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.primary },
    tint: colors.primary,
  },
  destructive: {
    container: { backgroundColor: colors.danger },
    text: { color: colors.onDanger },
    tint: colors.onDanger,
  },
};

const SIZE: Record<
  ButtonSize,
  { container: ViewStyle; text: TextStyle; iconSize: number; gap: number }
> = {
  sm: {
    container: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: 36,
    },
    text: { fontSize: fontSize.sm },
    iconSize: 16,
    gap: spacing.xs,
  },
  md: {
    container: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
    },
    text: { fontSize: fontSize.base },
    iconSize: 18,
    gap: spacing.sm,
  },
  lg: {
    container: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      minHeight: 52,
    },
    text: { fontSize: fontSize.base },
    iconSize: 20,
    gap: spacing.sm,
  },
};

export function Button({
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth,
  accessibilityLabel,
  children,
  style,
}: Props) {
  const inactive = disabled || loading;
  const v = VARIANT[variant];
  const s = SIZE[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        v.container,
        s.container,
        fullWidth && styles.fullWidth,
        pressed && !inactive && { opacity: opacity.pressed },
        // disabled 와 loading 모두 비활성 — 시각도 함께 dim 시켜 탭 안 먹힘 인상 제거.
        inactive && { opacity: opacity.disabled },
        style,
      ]}
    >
      <View style={[styles.row, { gap: s.gap }]}>
        {loading ? (
          <ActivityIndicator color={v.tint} size="small" />
        ) : leftIcon ? (
          <Ionicons name={leftIcon} size={s.iconSize} color={v.tint} />
        ) : null}
        <Text style={[styles.text, s.text, v.text]}>{children}</Text>
        {!loading && rightIcon ? (
          <Ionicons name={rightIcon} size={s.iconSize} color={v.tint} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontWeight: fontWeight.bold,
  },
  fullWidth: { alignSelf: 'stretch' },
});

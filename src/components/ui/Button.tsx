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
import { spacing, radius, fontSize, fontWeight, touchTarget } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { opacity } from '@/theme/motion';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'dangerGhost';
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
  // 낮은 비중 + 파괴적 — '위험 구역' 삭제 버튼용(투명 배경 + 빨강 글자).
  // ghost(파랑)는 비파괴 액션 전용으로 두어 '빨강=파괴' 규칙과 정합. (UI/UX P1)
  dangerGhost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.danger },
    tint: colors.danger,
  },
};

// sm 의 minHeight 는 36 — Direction 의 '터치 타깃 44px 이상' 을 어긴다(2026-07-30 감사에서
// 발견, callsite 43 곳). 높이를 44 로 올리면 43 곳의 레이아웃이 같이 움직이므로, **보이는
// 크기는 그대로 두고 터치 영역만 hitSlop 으로 44 까지 넓힌다** — 이 코드베이스가 작은 컨트롤에
// 이미 21 곳에서 쓰는 방법이다. 시각 밀도와 접근성을 둘 다 지키는 쪽.
const SIZE: Record<
  ButtonSize,
  {
    container: ViewStyle;
    text: TextStyle;
    iconSize: number;
    gap: number;
    // 보이는 높이가 touchTarget.control 보다 낮을 때만 채운다.
    hitSlop?: number;
  }
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
    hitSlop: (touchTarget.control - 36) / 2,
  },
  md: {
    container: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: touchTarget.control,
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
      hitSlop={s.hitSlop}
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
    fontFamily: fontFamily.bold,
    fontWeight: fontWeight.bold,
  },
  fullWidth: { alignSelf: 'stretch' },
});

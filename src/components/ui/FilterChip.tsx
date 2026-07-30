import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/spacing';

// 칩 실제 높이 ≈ paddingVertical(xs) × 2 + caption line-height ≈ 24.
const CHIP_HIT_SLOP = (touchTarget.control - 24) / 2;
import { fontFamily } from '@/theme/typography';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  dashed?: boolean;
  leftIcon?: IonName;
  disabled?: boolean;
}

// 5+ 화면에 흩어진 status / range filter chip 패턴 통합.
// active 시 색·테두리·폰트 강조를 한 곳에서 결정 — withAlpha(c, 0.13) 사용.
export function FilterChip({
  label,
  active,
  onPress,
  activeColor = colors.primary,
  dashed = false,
  leftIcon,
  disabled,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // 칩은 필터용이라 작게 두는 게 맞다(paddingVertical xs → 높이 ~24). 대신 터치 영역은
      // Direction 의 44 를 채운다 — Button sm 과 같은 방법(보이는 크기는 그대로).
      hitSlop={CHIP_HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        dashed && styles.dashed,
        active && {
          backgroundColor: withAlpha(activeColor, 0.13),
          borderColor: activeColor,
        },
        pressed && !disabled && { opacity: opacity.pressed },
        disabled && { opacity: opacity.disabled },
      ]}
    >
      {leftIcon ? (
        <Ionicons
          name={leftIcon}
          size={12}
          color={active ? activeColor : colors.textMuted}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          // active 시 fontFamily 도 bold 로 함께 — fontWeight 만 변경하면 iOS 에서
          // fontFamily.regular(=Pretendard-Regular) 위에 weight 강제라 폰트가 weight 와
          // mismatch (Pretendard 는 weight 별 별도 family). Android 도 일관 적용.
          active && {
            color: activeColor,
            fontFamily: fontFamily.bold,
            fontWeight: fontWeight.bold,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dashed: { borderStyle: 'dashed' },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});

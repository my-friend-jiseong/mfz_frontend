import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';
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
          active && { color: activeColor, fontWeight: fontWeight.bold },
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
    gap: 4,
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

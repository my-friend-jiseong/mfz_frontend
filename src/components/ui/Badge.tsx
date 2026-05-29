import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

export type BadgeTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

// 색 + 형상 + 라벨 3중 인코딩. shape 는 옵션이지만 status badge 에서는 가급적 사용.
export type BadgeShape = 'circle' | 'triangle' | 'square' | 'diamond';

interface Props {
  label: string;
  tone?: BadgeTone;
  shape?: BadgeShape;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

const TONE: Record<BadgeTone, { fg: string; bg: string }> = {
  primary: { fg: colors.primary, bg: colors.primaryMuted },
  success: { fg: colors.success, bg: colors.successMuted },
  warning: { fg: colors.warning, bg: colors.warningMuted },
  danger: { fg: colors.danger, bg: colors.dangerMuted },
  info: { fg: colors.info, bg: colors.infoMuted },
  neutral: { fg: colors.textMuted, bg: colors.neutralMuted },
};

const SHAPE: Record<BadgeShape, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  diamond: '◆',
};

export function Badge({
  label,
  tone = 'neutral',
  shape,
  size = 'sm',
  style,
}: Props) {
  const t = TONE[tone];
  const isMd = size === 'md';
  const fs = isMd ? fontSize.sm : fontSize.xs;
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: t.bg,
          paddingVertical: isMd ? 4 : 2,
          paddingHorizontal: isMd ? spacing.md : spacing.sm,
        },
        style,
      ]}
    >
      {shape ? (
        <Text style={[styles.shape, { color: t.fg, fontSize: fs }]}>
          {SHAPE[shape]}
        </Text>
      ) : null}
      <Text
        style={[styles.label, { color: t.fg, fontSize: fs }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    gap: 4,
  },
  shape: { fontFamily: fontFamily.regular },
  label: { fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
});

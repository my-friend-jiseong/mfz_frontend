import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { StatusMark } from './StatusMark';

export type BadgeTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

// 색 + 형상 + 라벨 3중 인코딩. shape 는 옵션이지만 status badge 에서는 가급적 사용.
// check = 2차 '조치 완료'(원 안 ✓). Badge 는 StatusMark SVG 로 그린다. 글리프 맵의 ✓(U+2713)는 글자로만
// 쓰는 곳(현장 상세 칩 등)용 — U+2714 ✔ 는 Android 에서 컬러 이모지로 나와 쓰지 않는다.
export type BadgeShape = 'circle' | 'triangle' | 'square' | 'diamond' | 'check';

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

// 형상 글리프의 단일 출처. `checkin` 이 같은 맵을 따로 갖고 있어(●▲■◆) 3중 인코딩 규칙의
// 두 번째 구현이 됐던 적이 있다 — FieldCard 에서 걷어낸 것과 같은 종류다. export 해서
// 배지가 아닌 컨트롤(방문 결과 칩 등)도 이 맵을 쓰게 한다.
export const BADGE_SHAPE_GLYPH: Record<BadgeShape, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  diamond: '◆',
  check: '✓',
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
      {shape === 'check' ? (
        <StatusMark status="done" size={fs} />
      ) : shape ? (
        <Text style={[styles.shape, { color: t.fg, fontSize: fs }]}>
          {BADGE_SHAPE_GLYPH[shape]}
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

import { StyleSheet, View, type DimensionValue } from 'react-native';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';

// 목록 로딩 자리표시 카드 (Figma `SkeletonCard` 470:4147) — 막대 3개(제목·본문·보조).
// 막대 폭은 Figma 의 200 / 280 / 140 (카드 내부 폭 334 기준)을 비율로 옮겼다.
const BARS: { height: number; width: DimensionValue }[] = [
  { height: 18, width: '60%' },
  { height: 14, width: '84%' },
  { height: 14, width: '42%' },
];

export function SkeletonCard() {
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="불러오는 중"
    >
      {BARS.map((b, i) => (
        <View key={i} style={[styles.bar, { height: b.height, width: b.width }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bar: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

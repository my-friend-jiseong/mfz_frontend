import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';

interface Props {
  startedAtLabel: string | null;
  arrived: number;
  skipped: number;
  total: number;
  ratio: number;
}

export function TripSummaryCard({
  startedAtLabel,
  arrived,
  skipped,
  total,
  ratio,
}: Props) {
  return (
    <Card padding="md" style={styles.card}>
      {startedAtLabel ? (
        <View style={styles.elapsedRow}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Text style={styles.elapsed}>{startedAtLabel}</Text>
        </View>
      ) : null}
      <View style={styles.progressRow}>
        <Text style={styles.label}>
          방문 {arrived}
          {skipped > 0 ? ` · 건너뜀 ${skipped}` : ''} / 총 {total}곳
        </Text>
        <Text style={styles.ratio}>{ratio}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio}%` }]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, marginBottom: spacing.sm },
  elapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  elapsed: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  ratio: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.heavy,
  },
  track: {
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
});

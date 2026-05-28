import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

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
          <Text variant="caption" weight="semibold" color="textMuted">
            {startedAtLabel}
          </Text>
        </View>
      ) : null}
      <View style={styles.progressRow}>
        <Text variant="bodySm" weight="semibold">
          방문 {arrived}
          {skipped > 0 ? ` · 건너뜀 ${skipped}` : ''} / 총 {total}곳
        </Text>
        <Text variant="bodySm" weight="heavy" color="primary">
          {ratio}%
        </Text>
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
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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

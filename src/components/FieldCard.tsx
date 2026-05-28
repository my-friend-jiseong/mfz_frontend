import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { FIELD_STATUS_LABEL, type Field } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';

interface Props {
  field: Field;
  onPress?: () => void;
}

const STATUS_SHAPE: Record<Field['status'], string> = {
  pending: '●',
  in_progress: '▲',
  done: '■',
};

export function FieldCard({ field, onPress }: Props) {
  const statusColor = colors.fieldStatus[field.status];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={[styles.statusChip, { backgroundColor: withAlpha(statusColor, 0.13) }]}>
          <Text variant="caption" style={{ color: statusColor }}>
            {STATUS_SHAPE[field.status]}
          </Text>
          <Text variant="caption" weight="semibold" style={{ color: statusColor }}>
            {FIELD_STATUS_LABEL[field.status]}
          </Text>
        </View>
      </View>
      <Text variant="body" weight="semibold">
        {field.address}
      </Text>
      {field.addressDetail ? (
        <Text variant="bodySm" color="textMuted" style={styles.detail}>
          {field.addressDetail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    gap: 4,
  },
  detail: { marginTop: 2 },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FIELD_STATUS_LABEL, type Field } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

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
        <View style={[styles.statusChip, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusShape, { color: statusColor }]}>
            {STATUS_SHAPE[field.status]}
          </Text>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {FIELD_STATUS_LABEL[field.status]}
          </Text>
        </View>
      </View>
      <Text style={styles.address}>{field.address}</Text>
      {field.addressDetail ? (
        <Text style={styles.detail}>{field.addressDetail}</Text>
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
  statusShape: { fontSize: fontSize.xs },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },
  address: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  detail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
});

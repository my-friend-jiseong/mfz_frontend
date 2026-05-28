import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, type BadgeShape, type BadgeTone } from '@/components/ui/Badge';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

interface Props {
  order: number;
  address: string;
  addressDetail?: string;
  statusLabel: string;
  statusTone: BadgeTone;
  statusShape?: BadgeShape;
  isCurrent: boolean;
  onPress: () => void;
}

export function DestinationRow({
  order,
  address,
  addressDetail,
  statusLabel,
  statusTone,
  statusShape,
  isCurrent,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isCurrent && styles.current,
        pressed && { opacity: opacity.pressed },
      ]}
    >
      <View style={[styles.orderBadge, isCurrent && styles.orderBadgeCurrent]}>
        <Text style={[styles.orderText, isCurrent && styles.orderTextCurrent]}>
          {order}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.address}>{address}</Text>
        {addressDetail ? <Text style={styles.detail}>{addressDetail}</Text> : null}
      </View>
      <Badge label={statusLabel} tone={statusTone} shape={statusShape} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  current: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  orderText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  orderTextCurrent: { color: colors.onPrimary },
  body: { flex: 1 },
  address: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.base,
  },
  detail: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
});

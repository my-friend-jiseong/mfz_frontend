import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, type BadgeShape, type BadgeTone } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
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

// 부모(active.tsx) 의 분 단위 setElapsedTick 으로 인한 헤더 재렌더에
// row 까지 휩쓸리지 않도록 props 비교 memo.
export const DestinationRow = memo(function DestinationRow({
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
        <Text
          variant="caption"
          weight="bold"
          color={isCurrent ? 'onPrimary' : 'text'}
        >
          {order}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="body" weight="semibold">
          {address}
        </Text>
        {addressDetail ? (
          <Text variant="caption" color="textMuted" style={styles.detail}>
            {addressDetail}
          </Text>
        ) : null}
      </View>
      <Badge label={statusLabel} tone={statusTone} shape={statusShape} />
    </Pressable>
  );
});

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
  body: { flex: 1 },
  detail: { marginTop: 2 },
});

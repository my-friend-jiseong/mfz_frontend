import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, type BadgeShape, type BadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

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
    // 표면을 손으로 짜지 않는다 — surface+border+radius 는 Card 가 준다 (강령 7).
    // 현재 목적지 강조(파랑 채움·테두리)만 style 로 덮어쓴다.
    <Card
      onPress={onPress}
      padding="md"
      style={[styles.row, isCurrent && styles.current]}
      accessibilityLabel={`${order}번째 ${address}, ${statusLabel}`}
    >
      <View style={[styles.orderBadge, isCurrent && styles.orderBadgeCurrent]}>
        <Text
          variant="caption"
          weight="bold"
          color={isCurrent ? 'onPrimary' : 'text'}
          numeric
        >
          {order}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="body" weight="semibold">
          {address}
        </Text>
        {/* 주소가 이미 상세주소로 끝나면 같은 말을 두 번 찍지 않는다 (fieldFacets 규칙). */}
        {fieldDetailLine({ address, addressDetail }) ? (
          <Text variant="caption" color="textMuted" style={styles.detail}>
            {fieldDetailLine({ address, addressDetail })}
          </Text>
        ) : null}
      </View>
      <Badge label={statusLabel} tone={statusTone} shape={statusShape} />
    </Card>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderRadius: radius.pill,
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

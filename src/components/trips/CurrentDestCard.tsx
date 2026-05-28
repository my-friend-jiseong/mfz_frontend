import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  order: number;
  address: string;
  addressDetail?: string;
  onNavigate: () => void;
  onCheckIn: () => void;
  onSkip: () => void;
  onReoptimize?: () => void;
  optimizing?: boolean;
  pendingCount?: number;
}

// 1차 액션(체크인) 풀폭 + separator + 유틸 row 3개 (icon + 작은 라벨).
// 이전: 풀폭 버튼 4개 수직 스택 → 위계 약하고 카드가 비대.
function UtilAction({
  icon,
  label,
  onPress,
  danger,
  loading,
}: {
  icon: IonName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const tint = danger ? colors.danger : colors.textMuted;
  const textColor = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.util,
        pressed && !loading && { opacity: opacity.pressed },
        loading && { opacity: opacity.disabled },
      ]}
    >
      <Ionicons name={icon} size={22} color={tint} />
      <Text style={[styles.utilLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

export function CurrentDestCard({
  order,
  address,
  addressDetail,
  onNavigate,
  onCheckIn,
  onSkip,
  onReoptimize,
  optimizing,
  pendingCount,
}: Props) {
  const showReop = onReoptimize && (pendingCount ?? 0) >= 2;
  return (
    <Card padding="lg" style={styles.card}>
      <Text style={styles.label}>현재 목적지 · {order}번째</Text>
      <Text style={styles.address}>{address}</Text>
      {addressDetail ? <Text style={styles.detail}>{addressDetail}</Text> : null}

      <Button
        onPress={onCheckIn}
        leftIcon="checkmark-circle"
        style={styles.checkIn}
        fullWidth
      >
        체크인
      </Button>

      <View style={styles.utilRow}>
        <UtilAction icon="navigate" label="길찾기" onPress={onNavigate} />
        {showReop ? (
          <UtilAction
            icon="sparkles"
            label="재최적화"
            onPress={onReoptimize}
            loading={optimizing}
          />
        ) : null}
        <UtilAction
          icon="play-skip-forward"
          label="건너뛰기"
          onPress={onSkip}
          danger
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  address: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.lg,
  },
  detail: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: lineHeight.sm,
  },
  checkIn: { marginTop: spacing.sm },
  utilRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(colors.primary, 0.2),
  },
  util: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  utilLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});

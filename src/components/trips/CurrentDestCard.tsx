import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

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

// 1차 액션(체크인) 풀폭 + utility row 3개 mini-card.
type UtilTone = 'primary' | 'warning' | 'danger';

const UTIL_COLOR: Record<UtilTone, string> = {
  primary: colors.primary,
  warning: colors.warning,
  danger: colors.danger,
};

function UtilAction({
  icon,
  label,
  onPress,
  tone = 'primary',
  loading,
}: {
  icon: IonName;
  label: string;
  onPress: () => void;
  tone?: UtilTone;
  loading?: boolean;
}) {
  const c = UTIL_COLOR[tone];
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
      <Ionicons name={icon} size={22} color={c} />
      <Text variant="caption" weight="semibold" style={{ color: c }}>
        {label}
      </Text>
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
      <Text variant="caption" weight="bold" color="primary">
        현재 목적지 · {order}번째
      </Text>
      <Text variant="h3">{address}</Text>
      {addressDetail ? <Text variant="bodySm">{addressDetail}</Text> : null}

      <Button
        onPress={onCheckIn}
        leftIcon="checkmark-circle"
        style={styles.checkIn}
        fullWidth
      >
        체크인
      </Button>

      <View style={styles.utilRow}>
        <UtilAction
          icon="navigate"
          label="길찾기"
          tone="primary"
          onPress={onNavigate}
        />
        {showReop ? (
          <UtilAction
            icon="sparkles"
            label={
              optimizing ? '최적화 중' : `재최적화 ${pendingCount}곳`
            }
            tone="warning"
            onPress={onReoptimize}
            loading={optimizing}
          />
        ) : null}
        <UtilAction
          icon="play-skip-forward"
          label="건너뛰기"
          tone="danger"
          onPress={onSkip}
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
  checkIn: { marginTop: spacing.sm },
  utilRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  util: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
});

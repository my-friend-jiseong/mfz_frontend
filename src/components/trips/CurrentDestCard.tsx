import { StyleSheet, Text } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';

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

      <Button onPress={onCheckIn} leftIcon="checkmark-circle" style={styles.checkIn} fullWidth>
        체크인
      </Button>
      <Button
        onPress={onNavigate}
        variant="secondary"
        leftIcon="navigate"
        fullWidth
      >
        길찾기 (외부 지도 앱)
      </Button>
      <Button onPress={onSkip} variant="ghost" size="sm" fullWidth>
        이 목적지 건너뛰기
      </Button>
      {showReop ? (
        <Button
          onPress={onReoptimize}
          variant="secondary"
          size="sm"
          fullWidth
          loading={optimizing}
          leftIcon="sparkles"
        >
          {optimizing ? '최적화 중' : `남은 경로 재최적화 (${pendingCount}개)`}
        </Button>
      ) : null}
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
});

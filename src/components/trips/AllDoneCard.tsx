import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export function AllDoneCard() {
  return (
    <Card padding="lg" style={styles.card}>
      <Ionicons name="checkmark-done-circle" size={32} color={colors.success} />
      <Text variant="body" weight="bold" color="success">
        모든 목적지 처리 완료
      </Text>
      <Text variant="bodySm" align="center">
        아래 버튼으로 외근을 종료해주세요
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
    alignItems: 'center',
    gap: spacing.xs,
  },
});

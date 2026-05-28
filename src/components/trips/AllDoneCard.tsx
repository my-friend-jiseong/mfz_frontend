import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';

export function AllDoneCard() {
  return (
    <Card padding="lg" style={styles.card}>
      <Ionicons name="checkmark-done-circle" size={32} color={colors.success} />
      <Text style={styles.title}>모든 목적지 처리 완료</Text>
      <Text style={styles.sub}>아래 버튼으로 외근을 종료해주세요</Text>
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
  title: {
    fontSize: fontSize.base,
    color: colors.success,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.base,
  },
  sub: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// 외근 진행 중 mutation 이 큐잉되었을 때 노출. 누르면 수동 flush 시도.
export function OfflineBadge() {
  const count = useOfflineQueueStore((s) => s.queue.length);
  const flushing = useOfflineQueueStore((s) => s.flushing);
  const flushAll = useOfflineQueueStore((s) => s.flushAll);

  if (count === 0) return null;

  return (
    <Pressable
      onPress={() => void flushAll()}
      disabled={flushing}
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}
    >
      <View style={styles.dot} />
      <Text style={styles.text}>
        {flushing ? `동기화 중... (${count}건)` : `동기화 대기 ${count}건 · 다시 시도`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#fff7e6',
    borderColor: '#f0ad4e',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f0ad4e',
  },
  text: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '600',
  },
});

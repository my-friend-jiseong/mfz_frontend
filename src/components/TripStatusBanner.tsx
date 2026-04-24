import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { colors } from '@/theme/colors';
import { spacing, fontSize } from '@/theme/spacing';

function formatElapsed(startIso: string) {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const diffMin = Math.max(0, Math.floor((now - start) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function TripStatusBanner() {
  const router = useRouter();
  const activeTripId = useTripStore((s) => s.activeTripId);
  const getById = useTripStore((s) => s.getById);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (activeTripId === null) return;
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, [activeTripId]);

  if (activeTripId === null) return null;
  const trip = getById(activeTripId);
  if (!trip) return null;

  return (
    <Pressable
      onPress={() => router.push(`/(tabs)/trips/${trip.id}` as never)}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
    >
      <View style={styles.dot} />
      <Text style={styles.text}>
        외근 중 · {formatElapsed(trip.startedAt)} · 탭하여 상세보기
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tripBanner,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  text: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
});

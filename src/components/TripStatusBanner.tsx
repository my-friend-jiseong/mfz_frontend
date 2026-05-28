import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

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
  // 좁은 selector — 전체 destinations 배열을 구독하면 다른 trip 의 mutation 까지
  // root layout 재렌더로 이어짐. number 반환이라 === equality 로 변할 때만 react.
  const total = useDestinationStore((s) =>
    activeTripId === null
      ? 0
      : s.destinations.reduce(
          (n, d) => n + (d.tripId === activeTripId ? 1 : 0),
          0,
        ),
  );
  const resolved = useDestinationStore((s) =>
    activeTripId === null
      ? 0
      : s.destinations.reduce(
          (n, d) =>
            n + (d.tripId === activeTripId && d.status !== 'pending' ? 1 : 0),
          0,
        ),
  );
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
      onPress={() => router.push('/(tabs)/trips/active' as never)}
      style={({ pressed }) => [styles.banner, pressed && { opacity: opacity.pressed }]}
      accessibilityRole="button"
      accessibilityLabel="외근 진행 화면으로 이동"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="navigate" size={14} color={colors.tripBanner} />
      </View>
      <View style={styles.body}>
        <Text style={styles.text}>
          외근 중 · {formatElapsed(trip.startedAt)}
          {total > 0 ? ` · ${resolved}/${total}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onDanger} />
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
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.onDanger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  text: {
    color: colors.onDanger,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
  },
});

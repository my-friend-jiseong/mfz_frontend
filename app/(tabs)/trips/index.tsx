import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Trip } from '@/types/entities';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDuration(a: string, b: string | null) {
  if (!b) return '진행 중';
  const diff = new Date(b).getTime() - new Date(a).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export default function TripsList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allTrips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const start = useTripStore((s) => s.start);
  const end = useTripStore((s) => s.end);
  const allVisits = useVisitStore((s) => s.visits);

  const trips = useMemo(
    () =>
      userId
        ? allTrips
            .filter((t) => t.workerId === userId)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [],
    [allTrips, userId],
  );

  const handleToggle = async () => {
    if (!userId) return;
    if (activeTripId) {
      const r = await end();
      if (r.ok) return;
      if ('needsConfirm' in r) {
        Alert.alert('외근 종료 확인', r.message, [
          { text: '취소', style: 'cancel' },
          {
            text: '종료',
            style: 'destructive',
            onPress: async () => {
              const force = await end(true);
              if (!force.ok && !('needsConfirm' in force)) {
                Alert.alert('오류', force.error);
              }
            },
          },
        ]);
      } else {
        Alert.alert('오류', r.error);
      }
    } else {
      const r = await start();
      if (!r.ok) Alert.alert('오류', r.error);
    }
  };

  const renderItem = ({ item }: { item: Trip }) => {
    const visitCount = allVisits.filter((v) => v.tripId === item.id).length;
    const isActive = item.id === activeTripId;
    return (
      <Pressable
        onPress={() => router.push(`/(tabs)/trips/${item.id}` as never)}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.row}>
          <Text style={styles.date}>{fmtDate(item.startedAt)}</Text>
          {isActive ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>진행 중</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta}>
          {fmtDuration(item.startedAt, item.endedAt)} · 방문 {visitCount}건
        </Text>
      </Pressable>
    );
  };

  return (
    <MapSheetLayout title="외근 내역">
      <BottomSheetFlatList
        data={trips}
        keyExtractor={(t) => String(t.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="외근 기록이 없습니다" description="아래 버튼을 눌러 외근을 시작하세요" />
        }
      />
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: activeTripId ? colors.danger : colors.primary },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.fabText}>{activeTripId ? '외근 종료' : '외근 시작'}</Text>
      </Pressable>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 120 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  activeBadge: {
    backgroundColor: colors.danger + '22',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.danger,
  },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  fabText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});

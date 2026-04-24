import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Visit } from '@/types/entities';

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const router = useRouter();

  const allTrips = useTripStore((s) => s.trips);
  const allVisits = useVisitStore((s) => s.visits);
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allPhotos = useVisitStore((s) => s.photos);
  const getField = useFieldStore((s) => s.getById);

  const trip = useMemo(
    () => allTrips.find((t) => t.id === tripId),
    [allTrips, tripId],
  );
  const visits = useMemo(
    () =>
      allVisits
        .filter((v) => v.tripId === tripId)
        .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt)),
    [allVisits, tripId],
  );
  const memoCountByVisit = (visitId: number) =>
    allTextMemos.filter((m) => m.visitId === visitId).length;
  const photoCountByVisit = (visitId: number) =>
    allPhotos.filter((p) => p.visitId === visitId).length;

  if (!trip) {
    return (
      <MapSheetLayout title="외근 상세" onBack={() => router.back()}>
        <EmptyState title="외근을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  const renderItem = ({ item }: { item: Visit }) => {
    const field = getField(item.fieldId);
    const statusColor = colors.visitStatus[item.status];
    const memoCount = memoCountByVisit(item.id);
    const photoCount = photoCountByVisit(item.id);

    return (
      <Pressable
        onPress={() =>
          field && router.push(`/(tabs)/fields/${field.id}` as never)
        }
        style={({ pressed }) => [styles.visitCard, pressed && styles.pressed]}
      >
        <View style={styles.visitHead}>
          <Text style={styles.visitTime}>{fmtTime(item.visitedAt)}</Text>
          <View style={[styles.statusChip, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.fieldAddr}>
          {field?.address ?? '알 수 없는 현장'}
        </Text>
        <Text style={styles.meta}>
          텍스트 메모 {memoCount}건 · 사진 {photoCount}건
        </Text>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View style={styles.summary}>
      <Text style={styles.summaryLine}>
        {new Date(trip.startedAt).toLocaleString('ko-KR')} ~{' '}
        {trip.endedAt
          ? new Date(trip.endedAt).toLocaleString('ko-KR')
          : '진행 중'}
      </Text>
      <Text style={styles.meta}>총 방문 {visits.length}건</Text>
      <Pressable
        onPress={() =>
          router.push(`/(tabs)/reports/new?tripId=${trip.id}` as never)
        }
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaText}>이 외근으로 보고서 작성</Text>
      </Pressable>
    </View>
  );

  return (
    <MapSheetLayout
      title={`외근 #${trip.id}`}
      onBack={() => router.back()}
      initialIndex={2}
    >
      <BottomSheetFlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="방문 기록이 없습니다" />}
      />
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  summaryLine: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  visitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  visitTime: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  fieldAddr: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
});

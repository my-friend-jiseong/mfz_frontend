import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View, Pressable } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { trips as tripsApi } from '@/api';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Visit } from '@/types/entities';

interface StateHistoryItem {
  changedAt?: string;
  fromStatus?: string | null;
  toStatus?: string;
  reason?: string | null;
  actor?: string;
  [key: string]: unknown;
}

function fmtDateTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = id ?? '';
  const router = useRouter();

  const allTrips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const endTrip = useTripStore((s) => s.end);
  const allVisits = useVisitStore((s) => s.visits);
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allPhotos = useVisitStore((s) => s.photos);
  const getField = useFieldStore((s) => s.getById);
  const allDestinations = useDestinationStore((s) => s.destinations);

  const destinations = useMemo(
    () =>
      allDestinations
        .filter((d) => d.tripId === tripId)
        .sort((a, b) => a.order - b.order),
    [allDestinations, tripId],
  );

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
  const memoCountByVisit = (visitId: string) =>
    allTextMemos.filter((m) => m.visitId === visitId).length;
  const photoCountByVisit = (visitId: string) =>
    allPhotos.filter((p) => p.visitId === visitId).length;

  // 상태 전환 이력 (감사용) — 응답 shape 백엔드 미명세 → unknown 으로 받아 안전 매핑
  const [stateHistory, setStateHistory] = useState<StateHistoryItem[]>([]);
  useEffect(() => {
    if (!tripId) return;
    void (async () => {
      try {
        const res = await tripsApi.stateHistory({ tripId });
        const items = Array.isArray(res?.items) ? (res.items as StateHistoryItem[]) : [];
        setStateHistory(items);
      } catch {
        setStateHistory([]);
      }
    })();
  }, [tripId]);

  if (!trip) {
    return (
      <MapSheetLayout title="외근 상세" onBack={() => router.back()}>
        <EmptyState title="외근을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  const isActive = trip.endedAt === null && activeTripId === trip.id;
  const handleEnd = async () => {
    const r = await endTrip();
    if (r.ok) return;
    if ('needsConfirm' in r) {
      Alert.alert('외근 종료 확인', r.message, [
        { text: '취소', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: async () => {
            const force = await endTrip(true);
            if (!force.ok && !('needsConfirm' in force)) {
              Alert.alert('오류', force.error);
            }
          },
        },
      ]);
    } else {
      Alert.alert('오류', r.error);
    }
  };

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
      <Text style={styles.meta}>
        계획 {destinations.length}곳 · 실제 방문 {visits.length}건
      </Text>
      {destinations.length > 0 ? (
        <View style={styles.planBox}>
          <Text style={styles.planTitle}>계획된 목적지</Text>
          {destinations.map((d) => {
            const f = getField(d.fieldId);
            return (
              <View key={d.id} style={styles.planRow}>
                <Text style={styles.planOrder}>{d.order}.</Text>
                <Text style={styles.planAddr} numberOfLines={1}>
                  {f?.address ?? '알 수 없는 현장'}
                </Text>
                <Text
                  style={[
                    styles.planStatus,
                    d.status === 'arrived' && { color: colors.success },
                    d.status === 'skipped' && { color: colors.textMuted },
                  ]}
                >
                  {d.status === 'arrived'
                    ? '완료'
                    : d.status === 'skipped'
                      ? '건너뜀'
                      : '예정'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {isActive ? (
        <Pressable
          onPress={() => void handleEnd()}
          style={({ pressed }) => [styles.endBtn, pressed && styles.pressed]}
        >
          <Text style={styles.endBtnText}>외근 종료</Text>
        </Pressable>
      ) : null}
      <View style={styles.ctaRow}>
        <Pressable
          onPress={() =>
            router.push(`/(tabs)/reports/generate?tripId=${trip.id}` as never)
          }
          style={({ pressed }) => [styles.cta, styles.ctaAi, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>✨ AI 보고서 생성</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            router.push(`/(tabs)/reports/new?tripId=${trip.id}` as never)
          }
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>수동 작성</Text>
        </Pressable>
      </View>
      {stateHistory.length > 0 ? (
        <View style={styles.historyBox}>
          <Text style={styles.historyTitle}>상태 전환 이력</Text>
          {stateHistory.map((h, idx) => (
            <View key={idx} style={styles.historyRow}>
              <Text style={styles.historyTime}>{fmtDateTime(h.changedAt)}</Text>
              <Text style={styles.historyText}>
                {h.fromStatus ? `${h.fromStatus} → ` : ''}
                {h.toStatus ?? ''}
                {h.reason ? ` · ${h.reason}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
  ctaRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cta: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  ctaAi: { backgroundColor: colors.success },
  ctaText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  endBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.danger,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  endBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  planBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  planTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planOrder: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '700',
    width: 20,
  },
  planAddr: {
    fontSize: fontSize.sm,
    color: colors.text,
    flex: 1,
  },
  planStatus: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: '700',
  },
  historyBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  historyTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  historyTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    minWidth: 70,
  },
  historyText: {
    fontSize: fontSize.xs,
    color: colors.text,
    flex: 1,
  },
});

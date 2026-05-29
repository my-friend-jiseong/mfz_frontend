import { useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { fmtDate, fmtDateTime, fmtDuration } from '@/utils/datetime';

// 외근 종료 직후 진입 — visit 결과 정정 + 현장 메모/사진을 한 화면에서 마무리.
// 단계 1: shell + 헤더 + 가드 (visit 카드/skipped 섹션/CTA 는 후속 단계).
export default function TripReview() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const id = tripId ?? '';

  const trip = useTripStore((s) => (id ? s.getById(id) : undefined));
  const activeTripId = useTripStore((s) => s.activeTripId);
  const visits = useVisitStore((s) =>
    id ? s.visits.filter((v) => v.tripId === id) : [],
  );
  const destinations = useDestinationStore((s) =>
    id
      ? s.destinations
          .filter((d) => d.tripId === id)
          .sort((a, b) => a.order - b.order)
      : [],
  );
  const getField = useFieldStore((s) => s.getById);

  const tripFieldIds = useMemo(
    () => destinations.map((d) => d.fieldId),
    [destinations],
  );

  // 잘못된 진입 가드 — tripId 없음
  if (!id) {
    return (
      <MapSheetLayout title="외근 정리" onBack={() => safeBack(router)}>
        <EmptyState
          icon="alert-circle-outline"
          title="외근 정보가 없습니다"
          description="외근 목록에서 다시 진입해주세요"
        />
      </MapSheetLayout>
    );
  }

  // 트립이 store 에 없으면 — race 가능성. 단순 EmptyState 로 (별도 fetch 없음).
  if (!trip) {
    return (
      <MapSheetLayout title="외근 정리" onBack={() => safeBack(router)}>
        <EmptyState
          icon="search-outline"
          title="외근을 찾을 수 없습니다"
          description="삭제됐거나 다른 사용자의 외근일 수 있습니다"
        />
      </MapSheetLayout>
    );
  }

  // 아직 진행 중인 트립으로 들어왔다면 active 화면으로 — 정리는 종료 후에만.
  if (activeTripId === id) {
    return <Redirect href="/(tabs)/trips/active" />;
  }

  const totalDest = destinations.length;
  const visitCount = visits.length;
  const skippedCount = destinations.filter((d) => d.status === 'skipped').length;

  return (
    <MapSheetLayout
      title="외근 정리"
      onBack={() => safeBack(router)}
      initialIndex={2}
      mapFieldIds={tripFieldIds}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="h2" weight="heavy">
            {trip.title || `${fmtDate(trip.startedAt)} 외근`}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text variant="bodySm" color="textMuted">
              {fmtDateTime(trip.startedAt)}
              {trip.endedAt ? ` ~ ${fmtDateTime(trip.endedAt)}` : ' · 진행 중'}
              {trip.endedAt
                ? ` · ${fmtDuration(trip.startedAt, trip.endedAt)}`
                : ''}
            </Text>
          </View>
          <Card padding="md" style={styles.statsCard}>
            <View style={styles.statRow}>
              <Text variant="caption" weight="bold" color="textMuted">
                방문
              </Text>
              <Text variant="body" weight="heavy" color="primary">
                {visitCount}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statRow}>
              <Text variant="caption" weight="bold" color="textMuted">
                건너뜀
              </Text>
              <Text variant="body" weight="heavy" color="textMuted">
                {skippedCount}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statRow}>
              <Text variant="caption" weight="bold" color="textMuted">
                계획
              </Text>
              <Text variant="body" weight="heavy">
                {totalDest}
              </Text>
            </View>
          </Card>
        </View>

        {visitCount === 0 && skippedCount === 0 ? (
          <EmptyState
            icon="footsteps-outline"
            title="방문 기록 없이 종료된 외근입니다"
            description="현장에 들르지 않았거나, 강제 종료된 외근입니다"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text variant="bodySm" color="textMuted" align="center">
              방문 카드 목록은 다음 단계에서 추가됩니다.
            </Text>
            <Text variant="caption" color="textSubtle" align="center">
              현재: visit {visitCount}건 · skipped {skippedCount}곳 · fields 캐시{' '}
              {tripFieldIds.filter((fid) => getField(fid)).length}/{tripFieldIds.length}
            </Text>
          </View>
        )}
      </BottomSheetScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statRow: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  placeholder: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
});

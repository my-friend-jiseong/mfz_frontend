import { useEffect, useMemo, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Platform,
  StyleSheet,
  ToastAndroid,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtTime } from '@/utils/datetime';
import { safeBack } from '@/utils/backNavigation';
import { navigateToReview } from '@/utils/postTripFlow';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import {
  VISIT_STATUS_LABEL,
  type Visit,
  type Destination,
} from '@/types/entities';

const DEST_LABEL: Record<Destination['status'], string> = {
  pending: '예정',
  arrived: '완료',
  skipped: '건너뜀',
};

const DEST_COLOR: Record<Destination['status'], string> = {
  pending: colors.warning,
  arrived: colors.success,
  skipped: colors.textMuted,
};


export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = id ?? '';
  const router = useRouter();

  const allTrips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const endTrip = useTripStore((s) => s.end);
  const loadTripDetail = useTripStore((s) => s.loadDetail);
  const allVisits = useVisitStore((s) => s.visits);
  const getField = useFieldStore((s) => s.getById);
  const allDestinations = useDestinationStore((s) => s.destinations);

  const destinations = useMemo(
    () =>
      allDestinations
        .filter((d) => d.tripId === tripId)
        .sort((a, b) => a.order - b.order),
    [allDestinations, tripId],
  );

  // 지도 배경엔 이 외근의 현장만 노출.
  const tripFieldIds = useMemo(
    () => destinations.map((d) => d.fieldId),
    [destinations],
  );

  // 진입 시 detail 페치 — visit timeline 을 visitStore 로 sync 해 새로고침 후도 방문 이력 보이게.
  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tripId) return;
    if (fetchedRef.current === tripId) return;
    fetchedRef.current = tripId;
    void loadTripDetail(tripId);
  }, [tripId, loadTripDetail]);

  const trip = useMemo(() => allTrips.find((t) => t.id === tripId), [allTrips, tripId]);
  const visits = useMemo(
    () =>
      allVisits
        .filter((v) => v.tripId === tripId)
        .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt)),
    [allVisits, tripId],
  );
  if (!trip) {
    return (
      <MapSheetLayout title="외근 상세" onBack={() => safeBack(router)}>
        <EmptyState icon="search-outline" title="외근을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  const isActive = trip.endedAt === null && activeTripId === trip.id;

  const finishEnd = (toastMsg: string) => {
    if (Platform.OS !== 'web') {
      ToastAndroid.show?.(toastMsg, ToastAndroid.SHORT);
    }
  };

  // 종료 직후 review 화면으로 단일 진입 — active.tsx 와 같은 동선. 보고서 작성 prompt 는 review footer CTA.
  const promptReportAfterEnd = (endedTripId: string) => {
    navigateToReview(router, endedTripId);
  };

  const handleEnd = async () => {
    const r = await endTrip();
    if (r.ok) {
      finishEnd('외근이 종료되었습니다');
      promptReportAfterEnd(r.trip.id);
      return;
    }
    if ('needsConfirm' in r) {
      const confirmEnd = async () => {
        const force = await endTrip(true);
        if (force.ok) {
          promptReportAfterEnd(force.trip.id);
          return;
        }
        if (!('needsConfirm' in force)) {
          if (Platform.OS === 'web') window.alert(`오류: ${force.error}`);
          else Alert.alert('오류', force.error);
        }
      };
      if (Platform.OS === 'web') {
        if (window.confirm(r.message)) void confirmEnd();
      } else {
        Alert.alert('외근 종료 확인', r.message, [
          { text: '취소', style: 'cancel' },
          { text: '종료', style: 'destructive', onPress: () => void confirmEnd() },
        ]);
      }
    } else {
      if (Platform.OS === 'web') window.alert(`오류: ${r.error}`);
      else Alert.alert('오류', r.error);
    }
  };

  const renderItem = ({ item }: { item: Visit }) => {
    const field = getField(item.fieldId);
    const badge = VISIT_STATUS_BADGE[item.status];
    return (
      <Card
        onPress={() =>
          router.push(
            `/(tabs)/trips/visit?tripId=${tripId}&visitId=${item.id}` as never,
          )
        }
        style={styles.visitCard}
      >
        <View style={styles.visitHead}>
          <Text variant="bodySm" weight="semibold" color="textMuted">
            {fmtTime(item.visitedAt)}
          </Text>
          <Badge
            label={VISIT_STATUS_LABEL[item.status]}
            tone={badge.tone}
            shape={badge.shape}
          />
        </View>
        <Text variant="body" weight="semibold">
          {field?.address || '알 수 없는 현장'}
        </Text>
      </Card>
    );
  };

  const ListHeader = () => (
    <View style={styles.summary}>
      {trip.title ? (
        <Text variant="h3" style={styles.tripTitle}>
          {trip.title}
        </Text>
      ) : null}
      <Text variant="bodySm">
        {new Date(trip.startedAt).toLocaleString('ko-KR')} ~{' '}
        {trip.endedAt
          ? new Date(trip.endedAt).toLocaleString('ko-KR')
          : '진행 중'}
      </Text>
      <Text variant="bodySm" color="textMuted" style={styles.meta}>
        {/*
         * destinationStore/visitStore 는 로컬 전용 — 서버 list 응답의
         * siteCount/visitCount 가 있으면 그걸 우선 (backlog §11).
         */}
        계획 {trip.siteCount ?? destinations.length}곳 · 실제 방문{' '}
        {trip.visitCount ?? visits.length}건
      </Text>
      {destinations.length > 0 ? (
        <Card padding="md" style={styles.planBox}>
          <Text
            variant="caption"
            weight="bold"
            color="textMuted"
            style={styles.planTitle}
          >
            계획된 목적지
          </Text>
          {destinations.map((d) => {
            const f = getField(d.fieldId);
            return (
              <View key={d.id} style={styles.planRow}>
                <Text variant="bodySm" weight="bold" style={styles.planOrder}>
                  {d.order}.
                </Text>
                <Text variant="bodySm" style={styles.planAddr} numberOfLines={1}>
                  {f?.address || '알 수 없는 현장'}
                </Text>
                <Text
                  variant="caption"
                  weight="bold"
                  style={{ color: DEST_COLOR[d.status] }}
                >
                  {DEST_LABEL[d.status]}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}
      {isActive ? (
        <Button
          onPress={() => void handleEnd()}
          variant="destructive"
          size="lg"
          fullWidth
          leftIcon="stop-circle"
          style={styles.endBtn}
        >
          외근 종료
        </Button>
      ) : (
        // 종료된 외근에 한해 review 재진입로. 종료 직후 한 번만 보던 정리 화면을
        // 나중에 다시 들어가 visit 결과 정정·메모/사진 추가를 마무리할 수 있게.
        <Button
          onPress={() =>
            router.push(`/(tabs)/trips/review?tripId=${trip.id}` as never)
          }
          variant="secondary"
          fullWidth
          leftIcon="checkmark-done"
          style={styles.reviewBtn}
        >
          외근 정리
        </Button>
      )}
      <Button
        onPress={() => router.push(`/(tabs)/reports/new?tripId=${trip.id}` as never)}
        fullWidth
        leftIcon="document-text"
        style={styles.composeBtn}
      >
        보고서 작성
      </Button>
    </View>
  );

  return (
    <MapSheetLayout
      title={trip.title || '외근 상세'}
      onBack={() => safeBack(router)}
      initialIndex={2}
      mapFieldIds={tripFieldIds}
    >
      <BottomSheetFlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="footsteps-outline" title="방문 기록이 없습니다" />
        }
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
  tripTitle: { marginBottom: 4 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: { marginBottom: spacing.sm },
  visitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  meta: { marginTop: 2 },
  composeBtn: { marginTop: spacing.md },
  endBtn: { marginTop: spacing.md },
  reviewBtn: { marginTop: spacing.md },
  planBox: { marginTop: spacing.sm, gap: spacing.xs },
  planTitle: { marginBottom: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planOrder: { width: 20 },
  planAddr: { flex: 1 },
});

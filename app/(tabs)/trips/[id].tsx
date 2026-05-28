import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeShape, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import {
  VISIT_STATUS_LABEL,
  type Visit,
  type VisitStatus,
  type Destination,
} from '@/types/entities';

// visit 결과 → badge 매핑.
const VISIT_BADGE: Record<VisitStatus, { tone: BadgeTone; shape: BadgeShape }> = {
  completed: { tone: 'success', shape: 'square' },
  absent: { tone: 'neutral', shape: 'circle' },
  refused: { tone: 'danger', shape: 'triangle' },
  unknown_address: { tone: 'info', shape: 'diamond' },
  revisit_needed: { tone: 'warning', shape: 'diamond' },
  other: { tone: 'neutral', shape: 'diamond' },
};

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

  const promptReportAfterEnd = (endedTripId: string) => {
    // IA cross-link X2 — 외근 종료 → 통합 보고서 작성(/reports/new) 진입.
    const goCompose = () =>
      router.replace(`/(tabs)/reports/new?tripId=${endedTripId}` as never);
    if (Platform.OS === 'web') {
      if (window.confirm('외근이 정상 종료되었습니다. 지금 보고서를 작성할까요?')) {
        goCompose();
      }
    } else {
      Alert.alert('외근 종료', '외근이 정상 종료되었습니다. 지금 보고서를 작성할까요?', [
        { text: '나중에', style: 'cancel' },
        { text: '지금 작성', onPress: goCompose },
      ]);
    }
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
    const badge = VISIT_BADGE[item.status];
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
          <Text style={styles.visitTime}>{fmtTime(item.visitedAt)}</Text>
          <Badge
            label={VISIT_STATUS_LABEL[item.status]}
            tone={badge.tone}
            shape={badge.shape}
          />
        </View>
        <Text style={styles.fieldAddr}>{field?.address || '알 수 없는 현장'}</Text>
      </Card>
    );
  };

  const ListHeader = () => (
    <View style={styles.summary}>
      {trip.title ? <Text style={styles.tripTitle}>{trip.title}</Text> : null}
      <Text style={styles.summaryLine}>
        {new Date(trip.startedAt).toLocaleString('ko-KR')} ~{' '}
        {trip.endedAt
          ? new Date(trip.endedAt).toLocaleString('ko-KR')
          : '진행 중'}
      </Text>
      <Text style={styles.meta}>
        {/*
         * destinationStore/visitStore 는 로컬 전용 — 서버 list 응답의
         * siteCount/visitCount 가 있으면 그걸 우선 (backlog §11).
         */}
        계획 {trip.siteCount ?? destinations.length}곳 · 실제 방문{' '}
        {trip.visitCount ?? visits.length}건
      </Text>
      {destinations.length > 0 ? (
        <Card padding="md" style={styles.planBox}>
          <Text style={styles.planTitle}>계획된 목적지</Text>
          {destinations.map((d) => {
            const f = getField(d.fieldId);
            return (
              <View key={d.id} style={styles.planRow}>
                <Text style={styles.planOrder}>{d.order}.</Text>
                <Text style={styles.planAddr} numberOfLines={1}>
                  {f?.address || '알 수 없는 현장'}
                </Text>
                <Text style={[styles.planStatus, { color: DEST_COLOR[d.status] }]}>
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
      ) : null}
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
  tripTitle: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: fontWeight.bold,
    marginBottom: 4,
    lineHeight: lineHeight.lg,
  },
  summaryLine: { fontSize: fontSize.sm, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: { marginBottom: spacing.sm },
  visitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  visitTime: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  fieldAddr: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  composeBtn: { marginTop: spacing.md },
  endBtn: { marginTop: spacing.md },
  planBox: { marginTop: spacing.sm, gap: spacing.xs },
  planTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    marginBottom: 4,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planOrder: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.bold,
    width: 20,
  },
  planAddr: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  planStatus: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
});

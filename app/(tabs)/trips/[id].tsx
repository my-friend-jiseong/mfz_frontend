import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Platform,
  Pressable,
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
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { VISIT_STATUS_LABEL, type Visit } from '@/types/entities';

// ERD v2: trip_status_transitions(상태 이력) 제거 — 상태 전환 이력 UI 없음.

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
  if (!trip) {
    return (
      <MapSheetLayout title="외근 상세" onBack={() => safeBack(router)}>
        <EmptyState title="외근을 찾을 수 없습니다" />
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
    // react-native-web 의 Alert.alert 다중 버튼 분기가 불안정 — web 은 window.confirm 사용.
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
    const statusColor = colors.visitStatus[item.status];

    return (
      <Pressable
        onPress={() =>
          router.push(
            `/(tabs)/trips/visit?tripId=${tripId}&visitId=${item.id}` as never,
          )
        }
        style={({ pressed }) => [styles.visitCard, pressed && styles.pressed]}
      >
        <View style={styles.visitHead}>
          <Text style={styles.visitTime}>{fmtTime(item.visitedAt)}</Text>
          <View style={[styles.statusChip, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {VISIT_STATUS_LABEL[item.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.fieldAddr}>
          {field?.address || '알 수 없는 현장'}
        </Text>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <View style={styles.summary}>
      {trip.title ? (
        <Text style={styles.tripTitle}>{trip.title}</Text>
      ) : null}
      <Text style={styles.summaryLine}>
        {new Date(trip.startedAt).toLocaleString('ko-KR')} ~{' '}
        {trip.endedAt
          ? new Date(trip.endedAt).toLocaleString('ko-KR')
          : '진행 중'}
      </Text>
      <Text style={styles.meta}>
        {/*
         * destinationStore/visitStore 는 로컬 전용(handoff §9a — 백엔드 destinations
         * 영속화 미진행). 다른 디바이스·세션에서 시작한 외근을 조회하면 로컬엔
         * 0곳·0건으로 들어와 사용자가 "분명 3곳 골랐는데 0곳" 을 본다.
         * 서버 list 응답의 siteCount/visitCount 가 있으면 그걸 우선 — backlog §11
         * destinations endpoint 가 들어오면 fallback 도 제거.
         */}
        계획 {trip.siteCount ?? destinations.length}곳 · 실제 방문 {trip.visitCount ?? visits.length}건
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
                  {f?.address || '알 수 없는 현장'}
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
      <Pressable
        onPress={() =>
          router.push(`/(tabs)/reports/new?tripId=${trip.id}` as never)
        }
        style={({ pressed }) => [styles.composeBtn, pressed && styles.pressed]}
      >
        <Text style={styles.composeBtnText}>📝 보고서 작성</Text>
      </Pressable>
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
  tripTitle: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '700',
    marginBottom: 4,
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
  composeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  composeBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
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

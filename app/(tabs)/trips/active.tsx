import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Redirect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Button } from '@/components/ui/Button';
import type { BadgeShape, BadgeTone } from '@/components/ui/Badge';
import { TripSummaryCard } from '@/components/trips/TripSummaryCard';
import { CurrentDestCard } from '@/components/trips/CurrentDestCard';
import { AllDoneCard } from '@/components/trips/AllDoneCard';
import { DestinationRow } from '@/components/trips/DestinationRow';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { trips as tripsApi, localizeError } from '@/api';
import { VISIT_STATUS_LABEL, type VisitStatus } from '@/types/entities';
import { nearestNeighborOrder } from '@/utils/routeOptimize';
import * as Linking from 'expo-linking';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight } from '@/theme/spacing';
import type { Destination } from '@/types/entities';

// destination 상태 → badge 매핑. 색 + 형상 + 라벨 3중 인코딩.
const DEST_BADGE: Record<
  Destination['status'],
  { tone: BadgeTone; shape: BadgeShape; label: string }
> = {
  pending: { tone: 'warning', shape: 'circle', label: '예정' },
  arrived: { tone: 'success', shape: 'square', label: '방문 완료' },
  skipped: { tone: 'neutral', shape: 'diamond', label: '건너뜀' },
};

// visit 결과(arrived 인 경우 우선 노출) → badge tone/shape 매핑.
const VISIT_BADGE: Record<VisitStatus, { tone: BadgeTone; shape: BadgeShape }> = {
  completed: { tone: 'success', shape: 'square' },
  absent: { tone: 'neutral', shape: 'circle' },
  refused: { tone: 'danger', shape: 'triangle' },
  unknown_address: { tone: 'info', shape: 'diamond' },
  revisit_needed: { tone: 'warning', shape: 'diamond' },
  other: { tone: 'neutral', shape: 'diamond' },
};

export default function ActiveTrip() {
  const router = useRouter();

  const activeTripId = useTripStore((s) => s.activeTripId);
  const endTrip = useTripStore((s) => s.end);
  const tripBusy = useTripStore((s) => s.busy);

  const allDestinations = useDestinationStore((s) => s.destinations);
  const markSkipped = useDestinationStore((s) => s.markSkipped);
  const removeByTrip = useDestinationStore((s) => s.removeByTrip);
  const reorderDestinations = useDestinationStore((s) => s.reorder);

  const getField = useFieldStore((s) => s.getById);
  const allVisits = useVisitStore((s) => s.visits);

  const allTrips = useTripStore((s) => s.trips);
  const activeTrip = useMemo(
    () => (activeTripId ? allTrips.find((t) => t.id === activeTripId) : null),
    [allTrips, activeTripId],
  );

  const [optimizing, setOptimizing] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);

  // 외근 진행 시간을 1분 주기로 갱신. 화면이 active 일 때만 동작.
  useEffect(() => {
    if (!activeTrip) return;
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [activeTrip]);

  const destinations = useMemo<Destination[]>(() => {
    if (activeTripId === null) return [];
    return allDestinations
      .filter((d) => d.tripId === activeTripId)
      .sort((a, b) => a.order - b.order);
  }, [allDestinations, activeTripId]);

  // 지도 배경엔 진행 중 외근의 현장만. 다른 현장은 흐림.
  const tripFieldIds = useMemo(
    () => destinations.map((d) => d.fieldId),
    [destinations],
  );

  // 진행률 통계 — arrived + skipped 가 처리됨, pending 만 남음.
  const progress = useMemo(() => {
    const total = destinations.length;
    const arrived = destinations.filter((d) => d.status === 'arrived').length;
    const skipped = destinations.filter((d) => d.status === 'skipped').length;
    const resolved = arrived + skipped;
    const ratio = total === 0 ? 0 : Math.round((resolved / total) * 100);
    return { total, arrived, skipped, resolved, ratio };
  }, [destinations]);

  const visitForDestination = (fieldId: string) => {
    if (!activeTripId) return null;
    return (
      allVisits.find((v) => v.tripId === activeTripId && v.fieldId === fieldId) ??
      null
    );
  };

  const elapsedLabel = useMemo(() => {
    void elapsedTick;
    if (!activeTrip) return null;
    const start = new Date(activeTrip.startedAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startedAtStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const diffMs = Math.max(0, Date.now() - start.getTime());
    const totalMin = Math.floor(diffMs / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const dur = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    return `${startedAtStr} 시작 · ${dur} 진행 중`;
  }, [activeTrip, elapsedTick]);

  const currentDest = useMemo(
    () => destinations.find((d) => d.status === 'pending'),
    [destinations],
  );

  const allDone =
    activeTripId !== null && destinations.length > 0 && !currentDest;

  const pendingDests = useMemo(
    () => destinations.filter((d) => d.status === 'pending'),
    [destinations],
  );
  const lastArrivedDest = useMemo(() => {
    const arrived = destinations.filter((d) => d.status === 'arrived');
    return arrived.length > 0 ? arrived[arrived.length - 1] : null;
  }, [destinations]);

  // 활성 외근이 없으면 이 화면에 머물 이유가 없음 — 외근 탭 메인으로 즉시 redirect.
  if (activeTripId === null) {
    return <Redirect href="/(tabs)/trips" />;
  }

  const handleNavigate = async () => {
    if (!currentDest) return;
    const field = getField(currentDest.fieldId);
    if (!field) return;

    // 백엔드 deep-links 응답 — providers 객체로 wrap (handoff §6c).
    // 응답 받기 실패 시 카카오맵 직링크로 폴백.
    if (activeTripId) {
      try {
        const res = await tripsApi.navigationDeepLinks(activeTripId, {
          fieldId: field.id,
          destinationName: field.address,
          destinationLat: field.latitude,
          destinationLng: field.longitude,
        });
        const PROVIDERS = [
          { key: 'kakao', label: '카카오맵' },
          { key: 'naver', label: '네이버 지도' },
          { key: 'google', label: '구글 지도' },
        ] as const;
        const entries: Array<{ label: string; url: string }> = [];
        for (const p of PROVIDERS) {
          const url = res.providers?.[p.key];
          if (typeof url === 'string' && url.startsWith('http')) {
            entries.push({ label: p.label, url });
          }
        }
        if (entries.length === 1) {
          await Linking.openURL(entries[0].url);
          return;
        }
        if (entries.length > 1) {
          Alert.alert('길찾기 — 지도 앱 선택', undefined, [
            { text: '취소', style: 'cancel' },
            ...entries.map((e) => ({
              text: e.label,
              onPress: () => void Linking.openURL(e.url),
            })),
          ]);
          return;
        }
      } catch {
        // fallthrough — 카카오맵 직링크
      }
    }
    void openKakaoRouteTo(field.address, field.latitude, field.longitude);
  };

  const handleCheckIn = () => {
    if (!currentDest) return;
    router.push(`/(tabs)/fields/${currentDest.fieldId}/checkin` as never);
  };

  const handleSkip = () => {
    if (!currentDest) return;
    Alert.alert('이 목적지를 건너뛸까요?', '나중에 별도 처리할 수 있습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '건너뛰기',
        style: 'destructive',
        onPress: () => markSkipped(currentDest.id),
      },
    ]);
  };

  const applyOptimizedOrder = (
    pendingOrderedIds: string[],
    summary: { algorithm: string; totalDistanceKm: number; totalEtaMinutes: number },
  ) => {
    if (!activeTripId) return;
    const resolvedIds = destinations
      .filter((d) => d.status !== 'pending')
      .map((d) => d.id);
    reorderDestinations(activeTripId, [...resolvedIds, ...pendingOrderedIds]);
    Alert.alert(
      '경로 재최적화 완료',
      `알고리즘: ${summary.algorithm}\n총 거리: ${summary.totalDistanceKm.toFixed(1)} km\n예상 ETA: ${summary.totalEtaMinutes}분`,
    );
  };

  const handleReoptimize = async () => {
    if (!activeTripId || pendingDests.length < 2) return;

    const pendingFields = pendingDests
      .map((d) => {
        const f = getField(d.fieldId);
        if (!f) return null;
        return {
          destId: d.id,
          fieldId: f.id,
          name: f.address,
          lat: f.latitude,
          lng: f.longitude,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (pendingFields.length < 2) {
      Alert.alert('재최적화 불가', '좌표가 있는 남은 목적지가 2개 이상 필요합니다.');
      return;
    }

    const startSource = lastArrivedDest ? getField(lastArrivedDest.fieldId) : null;
    const start = startSource
      ? { lat: startSource.latitude, lng: startSource.longitude }
      : { lat: pendingFields[0].lat, lng: pendingFields[0].lng };

    setOptimizing(true);
    try {
      const res = await tripsApi.optimizeNavigation(activeTripId, {
        startLat: start.lat,
        startLng: start.lng,
        fields: pendingFields.map((f) => ({
          fieldId: f.fieldId,
          name: f.name,
          lat: f.lat,
          lng: f.lng,
        })),
      });
      const fieldToDest = new Map(pendingFields.map((f) => [f.fieldId, f.destId]));
      const orderedDestIds = res.optimizedOrder
        .map((o) => fieldToDest.get(o.fieldId))
        .filter((id): id is string => typeof id === 'string');
      if (orderedDestIds.length !== pendingFields.length) {
        throw new Error('optimized_order_mismatch');
      }
      applyOptimizedOrder(orderedDestIds, res.summary);
    } catch (e) {
      const ordered = nearestNeighborOrder(
        start,
        pendingFields.map((f) => ({ id: f.destId, lat: f.lat, lng: f.lng })),
      );
      const totalDistanceKm = ordered.reduce(
        (sum, n) => sum + n.distanceFromPrevKm,
        0,
      );
      const totalEtaMinutes = ordered.reduce((sum, n) => sum + n.etaMinutes, 0);
      applyOptimizedOrder(
        ordered.map((n) => n.id),
        {
          algorithm: `nearest_neighbor (offline · ${localizeError(e)})`,
          totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
          totalEtaMinutes,
        },
      );
    } finally {
      setOptimizing(false);
    }
  };

  const finalizeEnd = (endedTripId: string, originalTripId: string | null) => {
    if (originalTripId !== null) {
      removeByTrip(originalTripId);
    }
    // web 에선 expo-router 의 router.replace 가 같은 trips Stack 의 active 화면을
    // 떠나지 못하는 케이스가 관찰됨. 브라우저 직접 navigation 으로 우회.
    if (Platform.OS === 'web') {
      window.location.assign('/trips');
      return;
    }
    router.replace('/(tabs)/trips' as never);
    Alert.alert('외근 종료', '외근이 종료되었습니다. 지금 보고서를 작성할까요?', [
      { text: '나중에', style: 'cancel' },
      {
        text: '지금 작성',
        onPress: () => router.replace(`/(tabs)/reports/new?tripId=${endedTripId}` as never),
      },
    ]);
  };

  const handleEnd = async () => {
    if (tripBusy) {
      console.warn('[trips/end] busy — ignoring click');
      return;
    }
    const tripId = activeTripId;
    const r = await endTrip();
    if (r.ok) {
      finalizeEnd(r.trip.id, tripId);
      return;
    }
    if ('needsConfirm' in r) {
      const confirmEnd = async () => {
        if (__DEV__) console.log('[trips/end] confirmEnd → endTrip(true)');
        const force = await endTrip(true);
        if (__DEV__) console.log('[trips/end] confirmEnd result', force);
        if (force.ok) {
          finalizeEnd(force.trip.id, tripId);
          return;
        }
        // force=true 호출이 또 needsConfirm 을 받았다 = 백엔드가 forceEndWithoutVisit:true 를
        // 못 받았거나 인식 안 하고 있음. 침묵하지 않고 사용자에게 명시.
        if ('needsConfirm' in force) {
          const msg =
            '외근 종료가 처리되지 않았습니다. (forceEndWithoutVisit 가 적용 안 됨)\n' +
            '잠시 후 다시 시도하거나 페이지를 새로고침해주세요.';
          console.error('[trips/end] force=true 호출이 confirm_required 반환', force);
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert('외근 종료 실패', msg);
          }
          return;
        }
        if (Platform.OS === 'web') {
          window.alert(`오류: ${force.error}`);
        } else {
          Alert.alert('오류', force.error);
        }
      };
      if (Platform.OS === 'web') {
        if (window.confirm(r.message)) {
          void confirmEnd();
        }
      } else {
        Alert.alert('외근 종료 확인', r.message, [
          { text: '취소', style: 'cancel' },
          { text: '종료', style: 'destructive', onPress: () => void confirmEnd() },
        ]);
      }
      return;
    }
    if (Platform.OS === 'web') {
      window.alert(`오류: ${r.error}`);
    } else {
      Alert.alert('오류', r.error);
    }
  };

  const ListHeader = () => (
    <View style={styles.header}>
      <TripSummaryCard
        startedAtLabel={elapsedLabel}
        arrived={progress.arrived}
        skipped={progress.skipped}
        total={progress.total}
        ratio={progress.ratio}
      />
      {currentDest
        ? (() => {
            const field = getField(currentDest.fieldId);
            return (
              <CurrentDestCard
                order={currentDest.order}
                address={field?.address ?? '알 수 없는 현장'}
                addressDetail={field?.addressDetail ?? undefined}
                onNavigate={() => void handleNavigate()}
                onCheckIn={handleCheckIn}
                onSkip={handleSkip}
                onReoptimize={
                  pendingDests.length >= 2 ? () => void handleReoptimize() : undefined
                }
                optimizing={optimizing}
                pendingCount={pendingDests.length}
              />
            );
          })()
        : <AllDoneCard />}
      <Text style={styles.sectionTitle}>목적지 ({destinations.length})</Text>
    </View>
  );

  const renderItem = ({ item }: { item: Destination }) => {
    const field = getField(item.fieldId);
    const isCurrent = item.id === currentDest?.id;
    // arrived 인 경우 visit 결과 라벨 우선 노출 (정상/부재/거절 등).
    const visit = item.status === 'arrived' ? visitForDestination(item.fieldId) : null;

    let statusLabel: string;
    let statusTone: BadgeTone;
    let statusShape: BadgeShape | undefined;
    if (visit) {
      const m = VISIT_BADGE[visit.status];
      statusLabel = VISIT_STATUS_LABEL[visit.status];
      statusTone = m.tone;
      statusShape = m.shape;
    } else {
      const m = DEST_BADGE[item.status];
      statusLabel = m.label;
      statusTone = m.tone;
      statusShape = m.shape;
    }

    const onPress = () => {
      if (visit) {
        router.push(
          `/(tabs)/trips/visit?tripId=${visit.tripId}&visitId=${visit.id}` as never,
        );
      } else if (field) {
        router.push(`/(tabs)/fields/${field.id}` as never);
      }
    };

    return (
      <DestinationRow
        order={item.order}
        address={field?.address ?? '알 수 없는 현장'}
        addressDetail={field?.addressDetail ?? undefined}
        statusLabel={statusLabel}
        statusTone={statusTone}
        statusShape={statusShape}
        isCurrent={isCurrent}
        onPress={onPress}
      />
    );
  };

  return (
    <View style={styles.screenRoot}>
      <MapSheetLayout
        title="진행 중인 외근"
        onBack={() => safeBack(router)}
        initialIndex={2}
        mapFieldIds={tripFieldIds}
      >
        <BottomSheetFlatList
          data={destinations}
          keyExtractor={(d) => String(d.id)}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.list}
        />
      </MapSheetLayout>
      {/* 종료 버튼은 BottomSheet 외부에 둔다 — 시트 내부 absolute 자식의 터치를
          @gorhom/bottom-sheet 의 pan 제스처가 가로채는 회로 차단. */}
      <View style={styles.endWrap}>
        <Button
          onPress={handleEnd}
          disabled={tripBusy}
          loading={tripBusy}
          variant="destructive"
          size="lg"
          fullWidth
          leftIcon="stop-circle"
        >
          {allDone ? '외근 종료' : '외근 종료 (미완료 목적지 있음)'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { paddingTop: spacing.md, gap: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    marginTop: spacing.lg,
  },
  endWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
  },
});

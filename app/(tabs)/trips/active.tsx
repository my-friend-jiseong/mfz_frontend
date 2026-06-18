import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Redirect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { Button } from '@/components/ui/Button';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import {
  VISIT_STATUS_BADGE,
  DESTINATION_STATUS_BADGE,
} from '@/theme/statusBadge';
import type { Visit } from '@/types/entities';
import { TripSummaryCard } from '@/components/trips/TripSummaryCard';
import { CurrentDestCard } from '@/components/trips/CurrentDestCard';
import { AllDoneCard } from '@/components/trips/AllDoneCard';
import { DestinationRow } from '@/components/trips/DestinationRow';
import { AddDestinationModal } from '@/components/trips/AddDestinationModal';
import { useQuickPhoto } from '@/components/fields/useQuickPhoto';
import { QuickPhotoSheet } from '@/components/fields/QuickPhotoSheet';
import { navigateToTripDetail } from '@/utils/postTripFlow';
import { trips as tripsApi, localizeError } from '@/api';
import { VISIT_STATUS_LABEL } from '@/types/entities';
import { nearestNeighborOrder } from '@/utils/routeOptimize';
import { safeBack } from '@/utils/backNavigation';
import { spacing } from '@/theme/spacing';
import type { Destination } from '@/types/entities';

export default function ActiveTrip() {
  const router = useRouter();

  const activeTripId = useTripStore((s) => s.activeTripId);
  const endTrip = useTripStore((s) => s.end);
  const tripBusy = useTripStore((s) => s.busy);

  const allDestinations = useDestinationStore((s) => s.destinations);
  const markSkipped = useDestinationStore((s) => s.markSkipped);
  const removeByTrip = useDestinationStore((s) => s.removeByTrip);
  const reorderDestinations = useDestinationStore((s) => s.reorder);
  const fetchDestinations = useDestinationStore((s) => s.fetchForTrip);

  const getField = useFieldStore((s) => s.getById);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const allVisits = useVisitStore((s) => s.visits);

  const allTrips = useTripStore((s) => s.trips);
  const activeTrip = useMemo(
    () => (activeTripId ? allTrips.find((t) => t.id === activeTripId) : null),
    [allTrips, activeTripId],
  );

  const [optimizing, setOptimizing] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  // Quick Photo — 외근 중 현장 도착 → 촬영이 주 사용처 (계획 §4-3 진입점 확장).
  // 훅 호출은 아래 activeTripId early return 보다 위에 — hook 순서 고정.
  const quickPhoto = useQuickPhoto();

  // 진입 시 서버에서 목적지 하이드레이트 — 다른 기기/세션/캐시정리 후 콜드스타트 대비
  // (backend-backlog §11). 로컬 캐시가 비었을 때만 fetch:
  //   - 방금 start 하이드레이트했거나 진행 중 낙관적 skip/reorder 가 있는 경우, in-flight GET 가
  //     이를 stale 서버 스냅샷으로 되돌리는 race 를 차단하고 중복 GET 도 제거.
  //   - 캐시가 비면(콜드스타트·크로스 기기) 그때만 서버에서 받아온다.
  useEffect(() => {
    if (!activeTripId) return;
    if (useDestinationStore.getState().byTrip(activeTripId).length > 0) return;
    void fetchDestinations(activeTripId);
  }, [activeTripId, fetchDestinations]);

  // 외근 진행 시간을 1분 주기로 갱신. 화면이 active 일 때만 동작.
  // deps 를 activeTripId (스칼라) 로 좁힘 — 이전엔 activeTrip 객체 (allTrips memo 결과)
  // 가 다른 store mutation 마다 새 reference 가 되어 인터벌이 분 단위로 리셋되는 회로.
  useEffect(() => {
    if (!activeTripId) return;
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [activeTripId]);

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

  // 진입 시 destination field 별 detail upsert — 새 세션/재진입 후 fieldStore 가
  // 비어있어 지도 마커가 0개로 보이던 회로 차단. tripFieldIds 가 변할 때만 재실행 (memo),
  // 이미 store 에 있는 field 는 건너뜀 (사이클 내 중복 호출도 자연스럽게 차단).
  // 이전 sort+join+split 우회·ref Set 방식 제거 — Set 이 영원히 누적되어
  // 같은 id 가 reorder/재추가됐을 때 stale 데이터가 박히던 회로도 함께 차단.
  useEffect(() => {
    for (const fid of tripFieldIds) {
      if (!fid) continue;
      if (useFieldStore.getState().getById(fid)) continue;
      void loadFieldDetail(fid);
    }
  }, [tripFieldIds, loadFieldDetail]);

  // 진행률 통계 — arrived + skipped 가 처리됨, pending 만 남음.
  const progress = useMemo(() => {
    const total = destinations.length;
    const arrived = destinations.filter((d) => d.status === 'arrived').length;
    const skipped = destinations.filter((d) => d.status === 'skipped').length;
    const resolved = arrived + skipped;
    const ratio = total === 0 ? 0 : Math.round((resolved / total) * 100);
    return { total, arrived, skipped, resolved, ratio };
  }, [destinations]);

  // O(1) visit lookup. 매 row 마다 allVisits.find 풀스캔하던 회로 차단.
  const visitByFieldId = useMemo(() => {
    const map = new Map<string, Visit>();
    if (!activeTripId) return map;
    for (const v of allVisits) {
      if (v.tripId === activeTripId) map.set(v.fieldId, v);
    }
    return map;
  }, [allVisits, activeTripId]);

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

  const handleNavigate = () => {
    if (!currentDest) return;
    const field = getField(currentDest.fieldId);
    if (!field) return;
    // 백엔드 분석/사이드이펙트(handoff §6c — 길찾기 트리거 시 destination 전이·감사 로그)
    // 보존을 위해 fire-and-forget POST. 응답은 사용하지 않음 (인앱 길안내는 아래 router.push).
    if (activeTripId) {
      void tripsApi
        .navigationDeepLinks(activeTripId, {
          fieldId: field.id,
          destinationName: field.address,
          destinationLat: field.latitude,
          destinationLng: field.longitude,
        })
        .catch(() => {
          // 분석 호출 실패는 사용자 흐름 차단 X.
        });
    }
    // 인앱 카카오 길안내 — 외부 앱 강제 분기 차단.
    router.push({
      pathname: '/(tabs)/trips/navigate',
      params: {
        name: field.address,
        lat: String(field.latitude),
        lng: String(field.longitude),
      },
    } as never);
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
    // 종료 직후 외근 상세(detail) 로 단일 진입 — 보고서 작성 prompt 는 detail footer CTA 가 가져감.
    navigateToTripDetail(router, endedTripId);
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

  // 함수 컴포넌트 (`() => JSX`) 형태로 ListHeaderComponent 에 넘기면 매 render 마다
  // 새 컴포넌트 reference → FlatList 가 헤더 서브트리를 unmount/remount.
  // React element 로 넘겨 일반 children 재조정만 받도록 함.
  const currentDestField = currentDest ? getField(currentDest.fieldId) : undefined;
  const listHeader = (
    <View style={styles.header}>
      <TripSummaryCard
        startedAtLabel={elapsedLabel}
        arrived={progress.arrived}
        skipped={progress.skipped}
        total={progress.total}
        ratio={progress.ratio}
      />
      {currentDest ? (
        <CurrentDestCard
          order={currentDest.order}
          // 상대 위치 — "전체 K곳 중 M번째" — order 가 갑자기 3 으로 점프하는 사용자 혼란 방지.
          positionLabel={`${progress.total}곳 중 ${progress.resolved + 1}번째`}
          address={currentDestField?.address ?? '알 수 없는 현장'}
          addressDetail={currentDestField?.addressDetail ?? undefined}
          onNavigate={handleNavigate}
          onCheckIn={handleCheckIn}
          onSkip={handleSkip}
          onShowField={
            currentDestField
              ? () =>
                  router.push(
                    `/(tabs)/fields/${currentDestField.id}` as never,
                  )
              : undefined
          }
          onReoptimize={
            pendingDests.length >= 2 ? () => void handleReoptimize() : undefined
          }
          optimizing={optimizing}
          pendingCount={pendingDests.length}
        />
      ) : (
        <AllDoneCard />
      )}
      <View style={styles.sectionTitleRow}>
        <Text variant="bodySm" weight="bold" color="textMuted">
          목적지 ({destinations.length})
        </Text>
        <Button
          onPress={() => setAddOpen(true)}
          variant="ghost"
          size="sm"
          leftIcon="add-circle-outline"
        >
          현장 추가
        </Button>
      </View>
    </View>
  );

  const renderItem = ({ item, index }: { item: Destination; index: number }) => {
    const field = getField(item.fieldId);
    const isCurrent = item.id === currentDest?.id;
    // arrived 인 경우 visit 결과 라벨 우선 노출 (정상/부재/거절 등).
    const visit = item.status === 'arrived' ? visitByFieldId.get(item.fieldId) ?? null : null;

    const m = visit
      ? { ...VISIT_STATUS_BADGE[visit.status], label: VISIT_STATUS_LABEL[visit.status] }
      : DESTINATION_STATUS_BADGE[item.status];

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
        order={index + 1}
        address={field?.address ?? '알 수 없는 현장'}
        addressDetail={field?.addressDetail ?? undefined}
        statusLabel={m.label}
        statusTone={m.tone}
        statusShape={m.shape}
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
          ListHeaderComponent={listHeader}
          style={sheetScrollableStyle}
          contentContainerStyle={styles.list}
        />
      </MapSheetLayout>
      {/* 종료 버튼은 BottomSheet 외부에 둔다 — 시트 내부 absolute 자식의 터치를
          @gorhom/bottom-sheet 의 pan 제스처가 가로채는 회로 차단. */}
      <StickyBottomBar>
        <View style={styles.bottomBarRow}>
          <Button
            onPress={handleEnd}
            disabled={tripBusy}
            loading={tripBusy}
            variant="destructive"
            size="lg"
            leftIcon="stop-circle"
            style={styles.bottomBarMain}
          >
            {allDone
              ? '외근 종료'
              : `외근 종료 (미완료 ${pendingDests.length}곳)`}
          </Button>
          <Button
            onPress={() => void quickPhoto.start()}
            variant="secondary"
            size="lg"
            leftIcon="camera"
            loading={quickPhoto.preparing}
            accessibilityLabel="빠른 촬영 — 가까운 현장에 사진 등록"
          >
            촬영
          </Button>
        </View>
      </StickyBottomBar>
      <QuickPhotoSheet
        session={quickPhoto.session}
        uploading={quickPhoto.uploading}
        onUpload={(f) => void quickPhoto.upload(f)}
        onFallback={quickPhoto.toFallback}
        onCreateNew={quickPhoto.createNew}
        onClose={quickPhoto.cancel}
      />
      <AddDestinationModal
        visible={addOpen}
        tripId={activeTripId}
        onClose={() => setAddOpen(false)}
        onCreateNew={() => router.push('/(tabs)/fields/new' as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  bottomBarRow: { flexDirection: 'row', gap: spacing.md },
  bottomBarMain: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { paddingTop: spacing.md, gap: spacing.sm },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
});

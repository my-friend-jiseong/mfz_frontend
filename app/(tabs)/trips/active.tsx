import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  VISIT_STATUS_BADGE,
  DESTINATION_STATUS_BADGE,
} from '@/theme/statusBadge';
import type { Visit } from '@/types/entities';
import { TripProgressStrip } from '@/components/trips/TripProgressStrip';
import { CurrentDestCard } from '@/components/trips/CurrentDestCard';
import { AllDoneCard } from '@/components/trips/AllDoneCard';
import { DestinationRow } from '@/components/trips/DestinationRow';
import { AddDestinationModal } from '@/components/trips/AddDestinationModal';
import { useQuickPhoto } from '@/components/fields/useQuickPhoto';
import { QuickPhotoSheet } from '@/components/fields/QuickPhotoSheet';
import { navigateToTripDetail } from '@/utils/postTripFlow';
import { trips as tripsApi, localizeError, ROUTE_MAX_WAYPOINTS } from '@/api';
import { VISIT_STATUS_LABEL } from '@/types/entities';
import { nearestNeighborOrder } from '@/utils/routeOptimize';
import { safeBack } from '@/utils/backNavigation';
import { spacing } from '@/theme/spacing';
import type { Destination } from '@/types/entities';

// ----- backend-backlog §22 헬퍼 -----
// 목적지 배열 → 경로 좌표열. 좌표가 없는 현장(0,0)은 건너뛴다.
function pointsOfDestinations(
  dests: readonly Destination[],
  getField: (id: string) => { latitude: number; longitude: number } | undefined,
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  for (const d of dests) {
    const f = getField(d.fieldId);
    if (!f) continue;
    if (f.latitude === 0 && f.longitude === 0) continue;
    pts.push({ lat: f.latitude, lng: f.longitude });
  }
  return pts;
}

/** 좌표열의 동일성 키 — 재요청 판단과 중복 호출 차단에 공유. */
function routeKeyOf(pts: readonly { lat: number; lng: number }[]): string {
  return pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

/**
 * 실도로 경로 요청. 실패(503 kakao_provider_unavailable 등)는 null 로 삼킨다 —
 * 호출 측은 직선 폴리라인·직선 ETA 로 폴백하면 되고, 지도는 계속 쓸모 있으므로
 * 사용자를 Alert 로 막지 않는다.
 */
async function requestRoute(
  tripId: string,
  pts: { lat: number; lng: number }[],
): Promise<{ vertexes?: { lat: number; lng: number }[]; distance?: number; duration?: number } | null> {
  if (pts.length < 2) return null;
  if (pts.length - 2 > ROUTE_MAX_WAYPOINTS) return null;
  try {
    return await tripsApi.route(tripId, {
      origin: pts[0],
      destination: pts[pts.length - 1],
      waypoints: pts.slice(1, -1),
    });
  } catch (e) {
    if (__DEV__) console.warn('[trips/route] 실도로 경로 실패, 직선 폴백', e);
    return null;
  }
}

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

  // 종료 진행 중 표식 — 아래 `activeTripId === null` 리다이렉트 가드를 재운다.
  // endTrip() 이 스토어의 activeTripId 를 비우는 순간 이 화면이 재렌더되는데, 그때 가드가
  // 먼저 발화하면 finalizeEnd 의 router.replace('/trips/{id}') 를 이겨 목록으로 튕긴다
  // (실측: 종료 후 외근 정리 화면 대신 /trips 에 도착). state 가 아니라 ref 인 이유는
  // 어차피 스토어 변경이 렌더를 유발하고, 그 렌더에서 이 값을 읽기만 하면 되기 때문.
  const endingRef = useRef(false);

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

  // ----- backend-backlog §22: 실도로 차량 경로 -----
  // 지도의 점선은 지금까지 목적지를 직선으로 이었다(1단계). 백엔드 프록시가 배포돼
  // 실제 도로 좌표열로 바꾼다. 순서는 직선과 동일하게 destinations 순 — 두 표현이 어긋나면
  // 순번 마커와 선이 다른 이야기를 하게 된다.
  const routePoints = useMemo(
    () => pointsOfDestinations(destinations, getField),
    [destinations, getField],
  );

  // 좌표열이 실제로 바뀔 때만 재요청 — destinations 객체 정체성 변화로 매 렌더 호출되는 걸 막는다.
  const routeKey = useMemo(() => routeKeyOf(routePoints), [routePoints]);

  const [routeVertexes, setRouteVertexes] = useState<
    { lat: number; lng: number }[] | undefined
  >(undefined);
  // 이미 요청을 마친 좌표열 — 재최적화가 직접 경로를 받아오면 여기에 기록해
  // 곧이은 이펙트의 중복 호출을 막는다. 카카오모빌리티 무료 쿼터가 유한하다(백로그 §22).
  const fetchedRouteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTripId || routePoints.length < 2) {
      setRouteVertexes(undefined);
      return;
    }
    if (fetchedRouteKeyRef.current === routeKey) return;
    // 경유지 상한(스펙 30). 초과분을 잘라내면 실제로 가지 않는 지름길이 그려지므로
    // 아예 요청하지 않고 직선 폴백을 유지한다.
    if (routePoints.length - 2 > ROUTE_MAX_WAYPOINTS) {
      setRouteVertexes(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await requestRoute(activeTripId, routePoints);
      if (cancelled) return;
      fetchedRouteKeyRef.current = routeKey;
      setRouteVertexes(res?.vertexes && res.vertexes.length >= 2 ? res.vertexes : undefined);
    })();
    return () => {
      cancelled = true;
    };
    // routeKey 가 좌표열의 진짜 변화를 대표한다 — routePoints 자체는 매 렌더 새 배열.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTripId, routeKey]);

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
  // 단 '종료 진행 중' 이면 보류 — 종료가 activeTripId 를 비운 직후의 재렌더에서 이 가드가
  // 상세 이동(router.replace)을 앞질러 목록으로 보내던 회로 차단 (endingRef 주석 참고).
  if (activeTripId === null) {
    // 종료 진행 중이면 리다이렉트를 보류하고 한 프레임 빈 화면으로 버틴다 —
    // 곧 finalizeEnd 의 router.replace 가 외근 정리 화면으로 데려간다.
    return endingRef.current ? null : <Redirect href="/(tabs)/trips" />;
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

  const applyOptimizedOrder = async (
    pendingOrderedIds: string[],
    summary: { algorithm: string; totalDistanceKm: number; totalEtaMinutes: number },
  ) => {
    if (!activeTripId) return;
    const resolvedIds = destinations
      .filter((d) => d.status !== 'pending')
      .map((d) => d.id);
    const nextOrder = [...resolvedIds, ...pendingOrderedIds];

    // backend-backlog §22 — 새 순서의 **실도로** 거리·소요를 받아 직선 추정치를 대체한다.
    // 여기서 받은 결과를 지도 폴리라인에도 물려 경로 이펙트가 같은 순서를 또 요청하지 않게 한다.
    //
    // 순서가 중요하다: reorderDestinations 가 리렌더를 유발하면 경로 이펙트가 **먼저** 발화한다.
    // 그래서 키를 미리 선점해 둬야 이펙트가 건너뛴다. 실측(2026-07-28): 선점 없이 두면
    // 재최적화 한 번에 /route 가 2회 호출됐다 — 카카오모빌리티 쿼터가 유한하다.
    const byId = new Map(destinations.map((d) => [d.id, d]));
    const orderedDests = nextOrder
      .map((id) => byId.get(id))
      .filter((d): d is Destination => d !== undefined);
    const pts = pointsOfDestinations(orderedDests, getField);
    fetchedRouteKeyRef.current = routeKeyOf(pts);
    reorderDestinations(activeTripId, nextOrder);

    const road = await requestRoute(activeTripId, pts);
    const vertexes =
      road?.vertexes && road.vertexes.length >= 2 ? road.vertexes : undefined;
    // 실패하면 새 순서의 직선으로 폴백한다 — 이전 순서의 실도로 선을 남겨두면
    // 지도가 실제와 다른 동선을 보여준다.
    setRouteVertexes(vertexes);
    // 못 받았으면 선점을 풀어 다음 기회(재마운트·순서 변경)에 다시 시도하게 둔다.
    if (!road) fetchedRouteKeyRef.current = null;

    const km =
      road?.distance != null ? road.distance / 1000 : summary.totalDistanceKm;
    const min =
      road?.duration != null
        ? Math.max(1, Math.round(road.duration / 60))
        : summary.totalEtaMinutes;
    // 실도로 값인지 직선 추정인지 밝힌다 — 숫자만 바뀌면 사용자가 오차를 오해한다.
    const basis = road?.distance != null ? '실도로 기준' : '직선거리 추정';
    Alert.alert(
      '경로 재최적화 완료',
      `알고리즘: ${summary.algorithm}\n총 거리: ${km.toFixed(1)} km (${basis})\n예상 ETA: ${min}분`,
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
      await applyOptimizedOrder(orderedDestIds, res.summary);
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
      await applyOptimizedOrder(
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
    // 아래 모든 실패 경로에서 되돌린다 — 안 그러면 종료가 실패했는데도 가드가 잠든 채
    // activeTripId 없는 화면에 갇힌다.
    endingRef.current = true;
    const r = await endTrip();
    if (r.ok) {
      finalizeEnd(r.trip.id, tripId);
      return;
    }
    if ('needsConfirm' in r) {
      // 재확인 다이얼로그를 띄우는 동안엔 플래그를 내려둔다 — 안드로이드 back 으로 Alert 를
      // 그냥 닫으면 어느 버튼의 onPress 도 안 돌아 플래그가 true 로 남고, 이후 외근이 다른
      // 경로로 종료되면 이 화면이 영원히 빈 화면(null)이 된다. 실제 종료 호출 직전에만 켠다.
      endingRef.current = false;
      const confirmEnd = async () => {
        if (__DEV__) console.log('[trips/end] confirmEnd → endTrip(true)');
        endingRef.current = true;
        const force = await endTrip(true);
        if (__DEV__) console.log('[trips/end] confirmEnd result', force);
        if (force.ok) {
          finalizeEnd(force.trip.id, tripId);
          return;
        }
        endingRef.current = false;
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
        // 취소·바깥 닫기 모두 별도 처리가 필요 없다 — 위에서 이미 플래그를 내려뒀고
        // confirmEnd 만 다시 켠다.
        Alert.alert('외근 종료 확인', r.message, [
          { text: '취소', style: 'cancel' },
          { text: '종료', style: 'destructive', onPress: () => void confirmEnd() },
        ]);
      }
      return;
    }
    endingRef.current = false;
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
      <TripProgressStrip
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

  // 종료는 외근당 한 번 — 목록 맨 아래에 둔다. 상시 고정 바에 두면 매 순간 주 CTA(길찾기·
  // 체크인)와 자리를 다툰다. 파괴적 액션을 하단으로 내리는 건 이 저장소의 기존 패턴이다
  // (ec6ab90 — 외근 삭제를 수정 화면 하단 위험 구역으로).
  // 미완료가 남았으면 dangerGhost, 전부 처리되면 그때가 종료할 때이므로 destructive 로 승격.
  const listFooter = (
    <View style={styles.footer}>
      <Button
        onPress={handleEnd}
        disabled={tripBusy}
        loading={tripBusy}
        variant={allDone ? 'destructive' : 'dangerGhost'}
        size="lg"
        fullWidth
        leftIcon="stop-circle"
      >
        {allDone ? '외근 종료' : `외근 종료 (미완료 ${pendingDests.length}곳)`}
      </Button>
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
        // 55% — 이동 중 쓰는 화면이라 위 절반에 지도를 남긴다. 최대(2)로 열면 지도가 60dp 만
        // 남아 순번 마커·경로선을 정작 이 화면에서 못 본다. select·order 와 같은 값.
        initialIndex={1}
        // 촬영은 외근 중 아무 때나 쓰는 동작이라 상시 노출이 필요한데, 화면 하단에 띄우면
        // 55% 시트에서 현재 목적지 카드의 길찾기·체크인을 덮는다(실측: 35dp 겹침).
        // 시트 헤더 우측이 항상 보이면서 주 CTA 와 자리를 다투지 않는 자리다.
        headerRight={
          <Button
            onPress={() => void quickPhoto.start()}
            variant="secondary"
            size="sm"
            leftIcon="camera"
            loading={quickPhoto.preparing}
            accessibilityLabel="빠른 촬영 — 가까운 현장에 사진 등록"
            // size="sm" 은 높이 36 — 최소 44dp 타깃까지 세로 여백으로 채운다.
            style={styles.headerAction}
          >
            촬영
          </Button>
        }
        mapFieldIds={tripFieldIds}
        // 목적지 순서 그대로 — 배경 지도에 순번 마커 + 점선 동선.
        routeFieldIds={tripFieldIds}
        routeVertexes={routeVertexes}
      >
        <BottomSheetFlatList
          data={destinations}
          keyExtractor={(d) => String(d.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          style={sheetScrollableStyle}
          contentContainerStyle={styles.list}
        />
      </MapSheetLayout>
      {/* 화면 하단에 떠 있는 바를 두지 않는다 — 시트를 55% 로 내리면 그 바가 현재 목적지
          카드의 주 CTA 를 덮는다(실측). 종료는 목록 하단(listFooter), 촬영은 시트 헤더 우측. */}
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
  // ★ paddingBottom 이 큰 이유 — 시트 콘텐츠 래퍼는 최대 detent 높이로 고정돼 있어(가로채기
  //   회피용, MapSheetLayout 주석 참고) 기본 detent(55%)에서는 래퍼 하단 ~130dp 가 화면
  //   밖이고 그 위 56dp 는 탭바에 가린다. 이 여백이 없으면 목록 끝까지 스크롤해도 마지막
  //   요소(외근 종료)가 탭바 뒤에 남아 아예 누를 수 없다(실측: 종료 611~631 vs 탭바 583~639).
  list: { paddingHorizontal: spacing.lg, paddingBottom: 240 },
  footer: { marginTop: spacing.lg },
  headerAction: { minHeight: 44, justifyContent: 'center' },
  header: { paddingTop: spacing.md, gap: spacing.sm },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
});

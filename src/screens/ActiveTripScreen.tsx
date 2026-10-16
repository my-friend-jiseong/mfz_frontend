import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { KakaoMapWebView, type KakaoMapHandle, type KakaoMapMarker, type MapPath } from '@/components/KakaoMapWebView';
import { Icon } from '@/components/icons';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { checkinHereHref, checkinHref, visitEditHref } from '@/utils/checkinNav';
import { useRealSafeAreaInsets } from '@/components/shell/realInsets';
import { useSharedMapSettings } from '@/components/map/useSharedMapSettings';
import { RecordMenu } from '@/components/trips/RecordMenu';
import { STATUS_TONE } from '@/components/trips/TripStopRow';
import { Button2 } from '@/components/ui/Button2';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { MapButton } from '@/components/ui/MapButton';
import { SheetHandle } from '@/components/ui/AppSheet';
import { snackbar } from '@/components/ui/Snackbar';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { trips as tripsApi } from '@/api';
import { useBottomChromeStore } from '@/stores/bottomChromeStore';
import { useCheckinQueueStore } from '@/stores/checkinQueueStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { runAfterNextPush } from '@/utils/afterPush';
import { deferSkip, flushDeferredSkips, undoSkip, UNDO_WINDOW_MS } from '@/utils/deferredSkip';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { fieldTitle } from '@/utils/fieldFacets';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import { withObjectJosa } from '@/utils/josa';
import { openRouteTo } from '@/utils/navigation';
import { formatDistanceM } from '@/utils/nearestField';
import { navigateToTripDetail } from '@/utils/postTripFlow';
import { haversineKm } from '@/utils/routeOptimize';
import { fmtSpan } from '@/utils/tripFormat';
import { loadTripStartPoint } from '@/utils/tripStartPoint';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import type { Destination, Field } from '@/types/entities';
import type { MapPinKind } from '@/components/KakaoMapWebView';

// Figma 7(538:2149): 아래 패널 200(탭 바 위), 지도 버튼은 패널 위 16, 경고 줄(60)이 있으면 그 위로.
const PANEL_H = 200;
const ROW_H = 60;
// '도착'으로 보는 거리(7-6). 인수인계 v135·결정: 목적지 100m 안.
const ARRIVE_M = 100;
const LOCATION_REFRESH_MS = 30_000;
const CLOCK_MS = 30_000;
// 펼친 목적지 목록의 최대 높이(화면 높이 비율).
const LIST_MAX_RATIO = 0.4;

const hasCoords = (f: Pick<Field, 'latitude' | 'longitude'> | undefined): f is Field =>
  !!f && Number.isFinite(f.latitude) && Number.isFinite(f.longitude) && !(f.latitude === 0 && f.longitude === 0);
const ll = (f: Field): LatLng => ({ lat: f.latitude, lng: f.longitude });

/**
 * 7 외근 진행(외근 탭 첫 화면, 외근 중). 상태: 7-1 종료 확인 · 7-2 오프라인 저장 · 7-3 저장 실패 · 7-6 도착 ·
 * 7-7 목적지 없음 · 7-8 1곳 방문 후 · 7-9 건너뛴 뒤 · 8-6 기록 메뉴. 7-5 길 안내는 카카오맵 앱(utils/navigation).
 */
export default function ActiveTrip() {
  const router = useRouter();
  // 종료 직후(endingTripId)에도 그 외근을 계속 그린다 — 이동이 끝나기 전에 화면이 비거나 목록으로 바뀌지 않게.
  const tripId = useTripStore((s) => s.activeTripId ?? s.endingTripId);
  const trip = useTripStore((s) => (tripId ? s.trips.find((t) => t.id === tripId) : undefined));
  const busy = useTripStore((s) => s.busy);
  const allDestinations = useDestinationStore((s) => s.destinations);
  // getById 는 참조가 고정이라 현장이 늦게 와도 다시 그려지지 않는다 — 배열을 구독한다.
  const fields = useFieldStore((s) => s.fields);
  const allVisits = useVisitStore((s) => s.visits);
  const queue = useCheckinQueueStore((s) => s.items);
  const tabBarH = useBottomChromeStore((s) => s.tabBar);
  const realInsets = useRealSafeAreaInsets();

  const mapRef = useRef<KakaoMapHandle>(null);
  const plusRef = useRef<View>(null);
  const [containerH, setContainerH] = useState(0);
  const [liveLoc, setLiveLoc] = useState<LatLng | null>(null);
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // 스낵바(7-6·7-9)가 떠 있는 동안 지도 버튼을 그 위로 올린다(Figma 7-9).
  const [snackUntil, setSnackUntil] = useState(0);
  // 길찾기를 연 목적지 — 앱으로 돌아왔을 때 그 근처면 7-6 도착 스낵바.
  const navTargetRef = useRef<string | null>(null);

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);

  // 진입 시 목적지·현장 하이드레이트(콜드스타트·다른 기기). 로컬 캐시가 있으면 그대로 쓴다 —
  // 진행 중인 낙관적 건너뛰기를 늦게 온 서버 응답이 되돌리지 않게.
  useEffect(() => {
    if (!tripId) return;
    if (useDestinationStore.getState().byTrip(tripId).length === 0) void useDestinationStore.getState().fetchForTrip(tripId);
    if (useFieldStore.getState().listStatus === 'idle') void useFieldStore.getState().hydrate();
    void loadTripStartPoint(tripId).then(setStartPoint);
  }, [tripId]);

  const destinations = useMemo<Destination[]>(
    () => (tripId ? allDestinations.filter((d) => d.tripId === tripId).sort((a, b) => a.order - b.order) : []),
    [allDestinations, tripId],
  );
  useEffect(() => {
    for (const d of destinations) {
      if (!useFieldStore.getState().getById(d.fieldId)) void useFieldStore.getState().loadDetail(d.fieldId);
    }
  }, [destinations]);

  const tripVisits = useMemo(() => (tripId ? allVisits.filter((v) => v.tripId === tripId) : []), [allVisits, tripId]);
  const visitByField = useMemo(() => new Map(tripVisits.map((v) => [v.fieldId, v])), [tripVisits]);
  // 이 외근의 저장 대기·실패(7-2·7-3). 다른 외근의 항목은 여기서 보이지 않는다.
  const tripQueue = useMemo(() => queue.filter((q) => q.tripId === tripId), [queue, tripId]);
  // 체크인 시각: 서버 방문 + 저장 대기 중인 체크인(기기 시각).
  const checkedAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of tripVisits) m.set(v.fieldId, v.visitedAt);
    for (const q of tripQueue) if (!m.has(q.fieldId)) m.set(q.fieldId, q.visitedAt);
    return m;
  }, [tripVisits, tripQueue]);

  const next = useMemo(() => destinations.find((d) => d.status === 'pending'), [destinations]);
  const nextField = next ? fieldById.get(next.fieldId) : undefined;
  const arrivedCount = destinations.filter((d) => d.status === 'arrived').length;
  // 마지막으로 체크인한 목적지 — 7-8: 내 위치·다음 목적지 거리는 그 현장 기준(v135).
  const lastArrived = useMemo(() => {
    const arrived = destinations.filter((d) => d.status === 'arrived');
    if (arrived.length === 0) return null;
    const at = (d: Destination) => checkedAt.get(d.fieldId) ?? '';
    return [...arrived].sort((a, b) => at(a).localeCompare(at(b)) || a.order - b.order)[arrived.length - 1];
  }, [destinations, checkedAt]);
  const lastArrivedField = lastArrived ? fieldById.get(lastArrived.fieldId) : undefined;
  // v135: 체크인한 뒤에는 내 위치를 방금 체크인한 현장으로 보고, 다음 목적지 거리도 그 현장 기준.
  // 실제 위치(liveLoc)는 7-6 도착 판단에만 쓴다.
  const origin: LatLng | null = hasCoords(lastArrivedField) ? ll(lastArrivedField) : liveLoc;
  const myDot = origin;

  const queuedForTrip = tripQueue.length;
  // 방문 수: 목적지 도착 + 목적지 아닌 곳에서 체크인한 방문(지금 위치 기록) + 저장 대기.
  const visitCount = Math.max(arrivedCount, tripVisits.length + tripQueue.filter((q) => !visitByField.has(q.fieldId)).length);
  const noDestination = !next;

  // === 시계·위치 ===
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const readLoc = () => void peekUserLocation().then((p) => alive && p && setLiveLoc(p));
      readLoc();
      setNow(Date.now());
      const locTimer = setInterval(readLoc, LOCATION_REFRESH_MS);
      const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
      return () => {
        alive = false;
        clearInterval(locTimer);
        clearInterval(clock);
        // 화면을 떠나면 되돌리기 창을 기다리지 않고 건너뛰기를 보낸다.
        void flushDeferredSkips();
      };
    }, []),
  );

  // 앱이 뒤로 가면 건너뛰기를 보낸다. 앞으로 오면 위치를 다시 읽고, 길찾기를 열었던 목적지 근처면 7-6.
  const nextRef = useRef<{ dest?: Destination; field?: Field }>({});
  nextRef.current = { dest: next, field: nextField };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      // inactive(알림 센터·전화 수신 등 잠깐)는 떠난 것으로 보지 않는다.
      if (st === 'background') {
        void flushDeferredSkips();
        return;
      }
      if (st !== 'active') return;
      setNow(Date.now());
      void peekUserLocation().then((p) => {
        if (!p) return;
        setLiveLoc(p);
        const { dest, field } = nextRef.current;
        if (!dest || !hasCoords(field) || navTargetRef.current !== dest.fieldId) return;
        if (haversineKm(p, ll(field)) * 1000 > ARRIVE_M) return;
        navTargetRef.current = null;
        // 버튼이 지도 버튼 위치를 되돌리는 상태 변경과 화면 이동을 한 배치에 섞지 않는다.
        showSnack(`${fieldTitle(field)}에 도착했어요`, {
          label: '체크인',
          onPress: () => setTimeout(() => router.push(checkinHref(dest.fieldId) as never), 0),
        });
      });
    });
    return () => sub.remove();
    // showSnack 은 ref·setState 만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // === 지도 ===
  const settings = useSharedMapSettings(fields, 'baseMap');
  const markers = useMemo<KakaoMapMarker[]>(() => {
    const out: KakaoMapMarker[] = [];
    destinations.forEach((d, i) => {
      const f = fieldById.get(d.fieldId);
      if (!hasCoords(f)) return;
      const kind: MapPinKind = d.status === 'arrived' ? 'visited' : d.status === 'skipped' ? 'skipped' : fieldActionStatus(f);
      out.push({
        id: f.id,
        lat: f.latitude,
        lng: f.longitude,
        label: fieldTitle(f),
        color: STATUS_PIN_COLOR[kind],
        pin: kind,
        order: i + 1,
        selected: d.id === next?.id,
        selectedSize: d.id === next?.id ? 'next' : undefined,
      });
    });
    // 건너뛴·방문한 핀을 먼저 그려 남은 목적지가 위에 오게 한다.
    return out.sort((a, b) => Number(a.pin === 'visited' || a.pin === 'skipped') > Number(b.pin === 'visited' || b.pin === 'skipped') ? -1 : 0);
  }, [destinations, fieldById, next?.id]);

  const paths = useMemo<MapPath[]>(() => {
    const out: MapPath[] = [];
    // 지나온 길(회색 실선): 출발 → 방문한 목적지(체크인 순).
    const visited = destinations
      .filter((d) => d.status === 'arrived')
      .sort((a, b) => (checkedAt.get(a.fieldId) ?? '').localeCompare(checkedAt.get(b.fieldId) ?? ''))
      .map((d) => fieldById.get(d.fieldId))
      .filter(hasCoords)
      .map(ll);
    // 출발 → 방문한 곳 → 지금 위치(Figma 7: 방문 0곳이면 출발에서 내 위치까지).
    const done = [...(startPoint ? [startPoint] : []), ...visited];
    const last = done[done.length - 1];
    if (myDot && (!last || last.lat !== myDot.lat || last.lng !== myDot.lng)) done.push(myDot);
    if (done.length >= 2) out.push({ points: done, tone: 'muted' });
    // 남은 길(파랑 점선): 지금 기준점 → 남은 목적지 순서대로. 건너뛴 곳(되돌리기 대기 포함)은 빼고 잇는다.
    const rest = destinations
      .filter((d) => d.status === 'pending')
      .map((d) => fieldById.get(d.fieldId))
      .filter(hasCoords)
      .map(ll);
    const remain = [...(origin ? [origin] : []), ...rest];
    if (remain.length >= 2) out.push({ points: remain, tone: 'brand', dotted: true });
    return out;
  }, [destinations, fieldById, checkedAt, startPoint, origin?.lat, origin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // === 저장 대기·실패(7-2·7-3) ===
  const pendingQ = tripQueue.filter((q) => q.state === 'pending');
  const failedQ = tripQueue.filter((q) => q.state === 'failed');
  const warning: 'failed' | 'offline' | null = failedQ.length > 0 ? 'failed' : pendingQ.length > 0 ? 'offline' : null;
  const retry = () => void useCheckinQueueStore.getState().flush({ retryFailed: true });

  // 스낵바가 닫힐 때 지도 버튼을 내리는 타이머 — 화면이 내려가면 지운다.
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    },
    [],
  );

  // === 동작 ===
  const showSnack = (message: string, action: { label: string; onPress: () => void }) => {
    // 탭 바 + 아래 패널 + 16 위(Figma 7-6·7-9 스낵바 484~544). bottomOffset 은 창 safe area 를 뺀 값이고
    // 탭 바 실측 높이(tabBarH)는 safe area 를 포함한다.
    const bottomOffset = Math.max(0, tabBarH - realInsets.bottom) + PANEL_H + space[16];
    snackbar.show({
      message,
      action: {
        label: action.label,
        onPress: () => {
          setSnackUntil(0);
          action.onPress();
        },
      },
      duration: UNDO_WINDOW_MS,
      bottomOffset,
    });
    setSnackUntil(Date.now() + UNDO_WINDOW_MS);
    if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    snackTimerRef.current = setTimeout(() => setSnackUntil((u) => (u <= Date.now() ? 0 : u)), UNDO_WINDOW_MS + 50);
  };

  const openRoute = () => {
    if (!next || !hasCoords(nextField)) return;
    navTargetRef.current = next.fieldId;
    // 서버 기록용(길찾기 트리거 감사 로그). 응답은 쓰지 않는다.
    if (tripId) {
      void tripsApi
        .navigationDeepLinks(tripId, {
          fieldId: nextField.id,
          destinationName: nextField.address,
          destinationLat: nextField.latitude,
          destinationLng: nextField.longitude,
        })
        .catch(() => {});
    }
    void openRouteTo({ name: fieldTitle(nextField), lat: nextField.latitude, lng: nextField.longitude }, liveLoc);
  };

  const checkIn = () => {
    if (!next) return;
    router.push(checkinHref(next.fieldId) as never);
  };

  // 지금 위치 기록(8-6·7-7) — 100m 안 현장이 있으면 8-4 근처 현장, 없으면 8-3 새 현장.
  const recordHere = () => router.push(checkinHereHref as never);
  // 사진으로 여러 곳 등록(8-7) — TODO(PR9): 화면 구현.
  const photoBatch = () => router.push('/photo-batch' as never);
  const addDestination = () => router.push('/(tabs)/trips/fields' as never);

  const skip = () => {
    if (!next) return;
    const dest = next;
    const name = nextField ? fieldTitle(nextField) : '이 현장';
    deferSkip(dest.id);
    showSnack(`${withObjectJosa(name)} 건너뛰었어요`, {
      label: '되돌리기',
      onPress: () => {
        // 스낵바가 닫히는 순간과 서버 반영이 겹치면 이미 보낸 뒤다 — 말없이 무시하지 않는다.
        if (!undoSkip(dest.id)) void notice('이미 반영됐어요', '건너뛴 현장은 다시 목적지로 되돌릴 수 없어요.');
      },
    });
  };

  const openMenu = () => {
    plusRef.current?.measureInWindow((x, y, w, h) => setMenuAnchor({ x, y, w, h }));
  };

  const finalizeEnd = (endedTripId: string) => {
    // 먼저 이동하고, 이 화면을 바꾸는 정리(목적지 비우기·종료 표식 해제 → 첫 화면이 1 로)는 전환이 끝난 뒤에.
    runAfterNextPush(() => {
      useDestinationStore.getState().removeByTrip(endedTripId);
      useTripStore.getState().clearEnding();
    });
    navigateToTripDetail(router, endedTripId);
  };

  const endingRef = useRef(false);
  const endTrip = async () => {
    // 두 번 누름 막기 — busy 는 서버 요청 동안만 켜져 확인 창·대기열 보내기 사이가 빈다.
    if (busy || endingRef.current) return;
    endingRef.current = true;
    try {
      await endTripInner();
    } finally {
      endingRef.current = false;
    }
  };
  const endTripInner = async () => {
    // 방문 0곳이면 7-1(문구는 앱 고정). 1곳 이상이면 바로 종료 → 3 외근 상세.
    const zero = visitCount === 0 && queuedForTrip === 0;
    if (zero) {
      const ok = await confirm({
        title: '외근을 종료할까요?',
        message: '아직 방문한 현장이 없어요. 종료하면 방문 0곳으로 기록되고, 이 외근으로는 보고서를 만들 수 없어요.',
        cancelLabel: '계속하기',
        confirmLabel: '종료',
        destructive: true,
      });
      if (!ok) return;
    }
    snackbar.hide();
    // 건너뛰기·저장 대기 체크인을 먼저 보낸다. 끝낸 뒤에는 이 외근에 붙일 수 없다(backlog 2차 H).
    await Promise.all([flushDeferredSkips(), useCheckinQueueStore.getState().flush({ retryFailed: true })]);
    const left = useCheckinQueueStore.getState().items.filter((q) => q.tripId === tripId).length;
    if (left > 0) {
      const ok = await confirm({
        title: '저장하지 못한 기록이 있어요',
        message: `지금 끝내면 체크인 ${left}건은 이 외근에 저장되지 않아요.`,
        cancelLabel: '계속하기',
        confirmLabel: '종료',
        destructive: true,
      });
      if (!ok) return;
      // 저장되지 않는다고 이미 알렸다 — 종료 뒤 대기열이 같은 내용을 또 묻지 않게 이 외근의 항목을 먼저 지운다.
      if (tripId) useCheckinQueueStore.getState().discardTrip(tripId);
    }
    const end = useTripStore.getState().end;
    let r = await end(zero);
    // 앱은 방문이 있다고 보는데 서버는 0곳(저장 대기 등) — 이미 사용자가 종료를 골랐으니 그대로 끝낸다.
    if (!r.ok && 'needsConfirm' in r) r = await end(true);
    if (r.ok) {
      finalizeEnd(r.trip.id);
      return;
    }
    await notice('외근을 종료하지 못했어요', 'needsConfirm' in r ? '잠시 뒤에 다시 해 주세요.' : r.error);
  };

  if (!tripId) return null;

  // === 표시 값 ===
  const elapsed = `${fmtSpan(trip?.startedAt, new Date(now).toISOString()) || '0분'}째`;
  const progressText = noDestination
    ? `방문 ${visitCount} · ${elapsed}`
    : `${arrivedCount}/${destinations.length} 방문 · ${elapsed}`;
  const nextIndex = next ? destinations.findIndex((d) => d.id === next.id) + 1 : 0;
  const nextKind = nextField ? fieldActionStatus(nextField) : 'pending';
  const fromOrigin = hasCoords(nextField) && origin ? haversineKm(origin, ll(nextField)) * 1000 : null;
  const fromLive = hasCoords(nextField) && liveLoc ? haversineKm(liveLoc, ll(nextField)) * 1000 : null;
  const arrived = fromLive != null && fromLive <= ARRIVE_M;
  const bottomStack = warning || snackUntil > now ? ROW_H + space[16] : 0;
  const listMax = Math.max(120, containerH * LIST_MAX_RATIO);

  return (
    <View style={styles.root} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      <KakaoMapWebView
        ref={mapRef}
        markers={markers}
        paths={paths}
        startPoint={startPoint}
        myLocation={myDot}
        baseMapType={settings.baseMapType}
        fitToMarkers={markers.length > 0}
        fitPadding={FIT_PADDING}
        center={markers.length === 0 ? (myDot ?? undefined) : undefined}
        initialLevel={5}
      />

      {/* 다음 목적지(7) · 목적지 없음(7-7) */}
      <SafeTop>
        <View style={styles.card}>
          {next ? (
            <>
              <View style={styles.flex}>
                <Text v2="caption.bold" tone="link">
                  다음 · {nextIndex}/{destinations.length}
                </Text>
                <Text v2="title.m" numberOfLines={1}>
                  {nextField ? fieldTitle(nextField) : ' '}
                </Text>
                <Text v2="bodyS.regular" tone="secondary" numberOfLines={1}>
                  {arrived ? (
                    <Text v2="bodyS.bold" tone="success">
                      도착
                    </Text>
                  ) : fromOrigin != null ? (
                    <>
                      <Text v2="bodyS.bold">{formatDistanceM(fromOrigin)}</Text> 남음
                    </>
                  ) : null}
                  {arrived || fromOrigin != null ? ' · ' : ''}
                  <Text v2="bodyS.semibold" tone={STATUS_TONE[nextKind]}>
                    {STATUS_LABEL[nextKind]}
                  </Text>
                </Text>
              </View>
              <Touchable
                onPress={openRoute}
                disabled={!hasCoords(nextField)}
                accessibilityRole="button"
                accessibilityLabel="길찾기"
                style={styles.routeBtn}
              >
                <Icon name="navigation" size={22} color={c2.text.brand} />
                <Text v2="small.bold" tone="brand">
                  길찾기
                </Text>
              </Touchable>
            </>
          ) : (
            <View style={styles.flex}>
              <Text v2="caption.bold" tone="link">
                목적지 없이 외근 중
              </Text>
              <Text v2="title.m">가는 곳에서 바로 기록해요</Text>
              <Text v2="bodyS.regular" tone="secondary">
                + 로 지금 위치를 기록할 수 있어요.
              </Text>
            </View>
          )}
        </View>
        <MapButton
          icon="layers"
          dot={settings.changed}
          accessibilityLabel="지도 설정"
          onPress={settings.openSettings}
          style={styles.layers}
        />
      </SafeTop>

      {/* 지도 버튼: 내 위치 · + (8-6) */}
      <View pointerEvents="box-none" style={[styles.fabs, { bottom: PANEL_H + space[16] + bottomStack }]}>
        <MapButton icon="locate" accessibilityLabel="내 위치" onPress={() => mapRef.current?.recenter(myDot ?? undefined)} />
        <MapButton ref={plusRef} icon="plus" accessibilityLabel="기록 메뉴" onPress={openMenu} />
      </View>

      {/* 7-2 · 7-3 화면 안 경고 줄 */}
      {warning ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.warn, warning === 'failed' ? styles.warnFailed : styles.warnOffline, { bottom: PANEL_H + space[16] }]}
        >
          <Icon name="info" size={20} color={warning === 'failed' ? c2.text.dangerDeep : c2.text.warningStrong} />
          <Text v2="bodyS.regular" tone={warning === 'failed' ? 'dangerDeep' : 'warningStrong'} style={styles.flex}>
            {warning === 'failed'
              ? failedQ.length === 1
                ? `${failedQ[0].label} 기록을 저장하지 못했어요.`
                : `${failedQ[0].label} 외 ${failedQ.length - 1}곳 기록을 저장하지 못했어요.`
              : '인터넷 연결이 없어 휴대폰에 임시 저장했어요.\n연결되면 자동으로 저장돼요.'}
          </Text>
          {warning === 'failed' ? (
            <Touchable onPress={retry} accessibilityRole="button" style={styles.warnAction}>
              <Text v2="bodyM.bold" tone="danger">
                다시 시도
              </Text>
            </Touchable>
          ) : null}
        </View>
      ) : null}

      {/* 아래 패널 */}
      <View style={styles.panel}>
        <Touchable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? '목적지 목록 접기' : '목적지 목록 펼치기'}
          noAutoHitSlop
          style={styles.handleTap}
        >
          <SheetHandle />
        </Touchable>
        <View style={styles.headRow}>
          <Text v2="bodyS.bold" tone="body" numeric>
            {progressText}
          </Text>
          {pendingQ.length > 0 ? (
            <View style={[styles.chip, styles.chipMuted]}>
              <Icon name="cloud-off" size={14} color={c2.text.secondary} />
              <Text v2="small.bold" tone="secondary" numeric>
                저장 대기 {pendingQ.length}
              </Text>
            </View>
          ) : null}
          {failedQ.length > 0 ? (
            <Touchable
              onPress={retry}
              accessibilityRole="button"
              accessibilityLabel={`저장 실패 ${failedQ.length}건, 다시 시도`}
              style={[styles.chip, styles.chipDanger]}
            >
              <Icon name="alert" size={14} color={c2.text.danger} />
              <Text v2="small.bold" tone="danger" numeric>
                저장 실패 {failedQ.length}
              </Text>
            </Touchable>
          ) : null}
          <View style={styles.flex} />
          <Touchable onPress={() => void endTrip()} disabled={busy} accessibilityRole="button" style={styles.endBtn}>
            <Text v2="bodyS.bold" tone="danger">
              외근 종료
            </Text>
          </Touchable>
        </View>
        {!noDestination ? (
          <View
            style={styles.progress}
            accessibilityRole="progressbar"
            accessibilityLabel="방문 진행"
            accessibilityValue={{ min: 0, max: destinations.length, now: arrivedCount, text: `${destinations.length}곳 중 ${arrivedCount}곳 방문` }}
          >
            {destinations.map((d) => (
              <View
                key={d.id}
                style={[
                  styles.seg,
                  d.status === 'arrived'
                    ? styles.segDone
                    : d.status === 'skipped'
                      ? styles.segSkipped
                      : d.id === next?.id
                        ? styles.segNext
                        : styles.segTodo,
                ]}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          {noDestination ? (
            <>
              <Button2 icon="place-record" onPress={recordHere} fullWidth>
                지금 위치 기록
              </Button2>
              <Button2 variant="secondary" size="M" icon="search" onPress={addDestination} fullWidth>
                목적지 추가
              </Button2>
            </>
          ) : (
            <>
              <Button2 icon="check" onPress={checkIn} fullWidth>
                체크인
              </Button2>
              <View style={styles.row2}>
                <Button2 variant="secondary" size="M" icon="search" onPress={addDestination} style={styles.flex}>
                  목적지 추가
                </Button2>
                <Button2 variant="secondary" size="M" onPress={skip} style={styles.flex}>
                  이 현장 건너뛰기
                </Button2>
              </View>
            </>
          )}
        </View>
        {expanded ? (
          <ScrollView style={{ maxHeight: listMax }} contentContainerStyle={styles.list}>
            <Text v2="bodyS.bold" tone="secondary" style={styles.listTitle}>
              목적지 {destinations.length}
            </Text>
            {destinations.length === 0 ? (
              <Text v2="bodyS.regular" tone="tertiary">
                담은 목적지가 없어요.
              </Text>
            ) : (
              destinations.map((d, i) => (
                <DestRow
                  key={d.id}
                  order={i + 1}
                  dest={d}
                  field={fieldById.get(d.fieldId)}
                  isNext={d.id === next?.id}
                  visitedAt={visitByField.get(d.fieldId)?.visitedAt}
                  divider={i > 0}
                  onPress={() => {
                    const v = visitByField.get(d.fieldId);
                    // 방문한 목적지는 3-7 방문 기록 수정, 아니면 5 현장 상세.
                    if (v) router.push(visitEditHref(v.id, v.tripId) as never);
                    else router.push({ pathname: '/(tabs)/trips/fields/[id]', params: { id: d.fieldId } } as never);
                  }}
                />
              ))
            )}
          </ScrollView>
        ) : null}
      </View>

      <RecordMenu
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        items={[
          { label: '지금 위치 기록', icon: 'place', onPress: recordHere },
          { label: '사진으로 여러 곳 등록', icon: 'image', onPress: photoBatch },
        ]}
      />
      {settings.sheet}
    </View>
  );
}

// 핀 맞춤 여백: 위 다음 목적지 카드(48+98+16), 아래 패널(200+여유).
const FIT_PADDING: [number, number, number, number] = [176, 72, PANEL_H + 40, 48];

function SafeTop({ children }: { children: React.ReactNode }) {
  return (
    <View pointerEvents="box-none" style={styles.top}>
      {children}
    </View>
  );
}

function DestRow({
  order,
  dest,
  field,
  isNext,
  visitedAt,
  divider,
  onPress,
}: {
  order: number;
  dest: Destination;
  field: Field | undefined;
  isNext: boolean;
  visitedAt?: string;
  divider: boolean;
  onPress: () => void;
}) {
  const kind = fieldActionStatus(field);
  const title = field ? fieldTitle(field) : '알 수 없는 현장';
  const hm = visitedAt ? new Date(visitedAt) : null;
  const sub =
    dest.status === 'arrived'
      ? hm && !Number.isNaN(hm.getTime())
        ? `체크인 ${String(hm.getHours()).padStart(2, '0')}:${String(hm.getMinutes()).padStart(2, '0')}`
        : '체크인'
      : dest.status === 'skipped'
        ? '체크인 없음'
        : null;
  return (
    <Touchable onPress={onPress} accessibilityRole="button" style={[styles.destRow, divider && styles.divider]}>
      <View
        style={[
          styles.orderDot,
          dest.status === 'arrived'
            ? { backgroundColor: c2.status.visited }
            : dest.status === 'skipped'
              ? styles.orderSkipped
              : { backgroundColor: STATUS_PIN_COLOR[kind] },
        ]}
      >
        <Text v2="bodyS.extrabold" tone={dest.status === 'skipped' ? 'tertiary' : 'inverse'} numeric>
          {order}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text v2="bodyL.semibold" numberOfLines={1} tone={dest.status === 'pending' ? 'primary' : 'tertiary'}>
          {title}
        </Text>
        <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
          {sub ?? (
            <Text v2="caption.semibold" tone={STATUS_TONE[kind]}>
              {STATUS_LABEL[kind]}
            </Text>
          )}
        </Text>
      </View>
      {dest.status === 'skipped' ? (
        <Text v2="caption.semibold" tone="tertiary">
          건너뜀
        </Text>
      ) : isNext ? (
        <Text v2="caption.bold" tone="link">
          다음
        </Text>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.muted },
  flex: { flex: 1 },
  top: { position: 'absolute', left: space[12], right: space[12], top: 48 },
  card: {
    minHeight: 98,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingLeft: 18,
    paddingRight: space[14],
    paddingVertical: space[12],
    borderRadius: radius2['2xl'],
    backgroundColor: c2.bg.canvas,
    ...elevation2.card,
  },
  routeBtn: {
    width: 59,
    height: 52,
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layers: { alignSelf: 'flex-end', marginTop: 22, marginRight: space[4] },
  fabs: { position: 'absolute', right: space[16], gap: space[12] },
  warn: {
    position: 'absolute',
    left: space[12],
    right: space[12],
    minHeight: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingLeft: space[16],
    paddingRight: space[12],
    paddingVertical: space[8],
    borderRadius: radius2.lg,
    borderWidth: 1,
    ...elevation2.card,
  },
  warnOffline: { backgroundColor: c2.bg.warningSubtle, borderColor: c2.border.warning },
  warnFailed: { backgroundColor: c2.bg.dangerSubtle, borderColor: c2.border.danger },
  warnAction: { height: 44, justifyContent: 'center', paddingLeft: space[12], paddingRight: space[4] },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: PANEL_H,
    paddingBottom: space[12],
    borderTopLeftRadius: radius2['2xl'],
    borderTopRightRadius: radius2['2xl'],
    backgroundColor: c2.bg.canvas,
    ...elevation2.sheet,
  },
  handleTap: { alignItems: 'center' },
  headRow: {
    height: 40,
    marginTop: -6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingLeft: space[20],
    paddingRight: space[16],
  },
  chip: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingLeft: 9,
    paddingRight: space[8],
    borderRadius: radius2.md,
  },
  chipMuted: { backgroundColor: c2.bg.muted },
  chipDanger: { backgroundColor: c2.bg.dangerSubtle },
  endBtn: { height: 40, justifyContent: 'center', paddingHorizontal: space[4] },
  progress: { flexDirection: 'row', gap: space[4], paddingHorizontal: space[20], marginTop: space[4] },
  seg: { flex: 1, height: 6, borderRadius: 3 },
  segDone: { backgroundColor: c2.bg.brand },
  segNext: { backgroundColor: c2.bg.brand, opacity: 0.35 },
  segSkipped: { backgroundColor: c2.bg.strong },
  segTodo: { backgroundColor: c2.bg.placeholder },
  actions: { paddingHorizontal: space[16], paddingTop: space[14], gap: space[8] },
  row2: { flexDirection: 'row', gap: space[8] },
  list: { paddingHorizontal: space[20], paddingTop: space[16], paddingBottom: space[8] },
  listTitle: { paddingBottom: space[4] },
  destRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  orderDot: { width: 28, height: 28, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  orderSkipped: { backgroundColor: c2.bg.canvas, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c2.status.visited },
});

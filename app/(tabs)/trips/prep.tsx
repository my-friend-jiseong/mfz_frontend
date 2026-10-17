import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapWebView, type KakaoMapHandle, type KakaoMapMarker } from '@/components/KakaoMapWebView';
import { FieldSearchRow } from '@/components/fields/SearchRows';
import { ErrorState } from '@/components/ErrorState';
import { useSharedMapSettings } from '@/components/map/useSharedMapSettings';
import { goToTabRoot } from '@/components/shell/tabNav';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { STATUS_TONE } from '@/components/trips/TripStopRow';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { notice } from '@/components/ui/ConfirmDialog';
import { MapButton } from '@/components/ui/MapButton';
import { SearchBar } from '@/components/ui/SearchBar';
import { SheetHandle } from '@/components/ui/AppSheet';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { TRIP_MAX_PLANNED_FIELDS } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useTripPrepStore } from '@/stores/tripPrepStore';
import { useTripStore } from '@/stores/tripStore';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { fieldTitle } from '@/utils/fieldFacets';
import { districtOf } from '@/utils/addressFormat';
import { fmtMonthDay } from '@/utils/datetime';
import { formatDistanceM } from '@/utils/nearestField';
import { haversineKm, nearestNeighborOrder } from '@/utils/routeOptimize';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import { safeBack } from '@/utils/backNavigation';
import { defaultTripTitle } from '@/utils/tripFormat';
import { saveTripStartPoint } from '@/utils/tripStartPoint';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import type { Field } from '@/types/entities';

// Figma 6(636:3138): 접힌 시트는 탭 바 위 396(출발 줄 79 포함). 지도 위 머리(52)는 위 52.
const SHEET_COLLAPSED = 396;
const HEADER_H = 52;
const FOOTER_H = 79;
const SHEET_HANDLE_H = 20;
const MAX_RECENT = 20;

const SheetHandleSlot = () => <SheetHandle />;

// 카카오 지도 level 의 해상도: level 3 = 1m/px, 한 단계마다 2배.
const M_PER_DEG_LAT = 111_320;
/**
 * 점들이 시트 위 보이는 영역(머리 아래 ~ 접힌 시트 위)에 들어오는 중심·level. 점이 없으면 null.
 * 지도 중심은 화면 가운데라, 보이는 영역 가운데에 오도록 시트 높이의 절반만큼 남쪽으로 내린다.
 */
function viewFor(points: { lat: number; lng: number }[], containerH: number, containerW: number, topInset: number) {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const spanY = (Math.max(...lats) - Math.min(...lats)) * M_PER_DEG_LAT;
  const spanX = (Math.max(...lngs) - Math.min(...lngs)) * mPerDegLng;
  const top = topInset + space[8] + HEADER_H + FIT_MARGIN;
  const visibleH = Math.max(120, containerH - SHEET_COLLAPSED - top - FIT_MARGIN);
  const visibleW = Math.max(120, containerW - FIT_MARGIN * 2);
  const mpp = Math.max(spanY / visibleH, spanX / visibleW, 1);
  const level = Math.min(14, Math.max(5, Math.ceil(Math.log2(mpp) + 3)));
  const realMpp = 2 ** (level - 3);
  // 보이는 영역의 가운데 = 화면 위에서 top + visibleH/2. 화면 가운데(containerH/2)와의 차이만큼 중심을 옮긴다.
  const shiftPx = containerH / 2 - (top + visibleH / 2);
  return { lat: midLat - (shiftPx * realMpp) / M_PER_DEG_LAT, lng: midLng, level };
}
// 맞춤 여백(핀 높이·이름표 포함).
const FIT_MARGIN = 56;

const hasCoords = (f: Pick<Field, 'latitude' | 'longitude'>) =>
  Number.isFinite(f.latitude) && Number.isFinite(f.longitude) && !(f.latitude === 0 && f.longitude === 0);

/**
 * 6 외근 준비 · 6-1 담은 현장 없음. 1 지도의 [외근 시작]으로 들어온다.
 * 최근 방문한 현장의 '+' 또는 검색(4)으로 담고 [출발]하면 7 외근 진행. 담지 않고 출발하면 7-7(목적지 없음).
 * 담은 목록은 tripPrepStore(4·5 에서 담은 것과 같은 목록)이고 [출발]하면 비운다(tripStore.start).
 */
export default function TripPrepScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const listReady = useFieldStore((s) => s.listStatus === 'ready');
  const listError = useFieldStore((s) => (s.listStatus === 'error' ? s.listError : null));
  const prepIds = useTripPrepStore((s) => s.fieldIds);
  const prepHydrated = useTripPrepStore((s) => s.hydrated);
  const startTrip = useTripStore((s) => s.start);
  const busy = useTripStore((s) => s.busy);
  const mapRef = useRef<KakaoMapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const [containerH, setContainerH] = useState<number | null>(null);
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  const [reordering, setReordering] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // 담은 목록은 저장본을 다 읽은 뒤에 보인다 — 읽기 전에 그리면 빈 목록(6-1)이 잠깐 보인다.
    void useTripPrepStore.getState().hydrate();
    void peekUserLocation().then((p) => p && setMyLoc(p));
    if (useFieldStore.getState().listStatus === 'idle') void useFieldStore.getState().hydrate();
  }, []);

  // 새로 만든 현장은 응답에 담당자가 비어 올 수 있다 — 빈 값도 내 현장으로 본다(4 현장 검색과 같음).
  const myFields = useMemo(() => allFields.filter((f) => !f.userId || f.userId === userId), [allFields, userId]);
  const fieldById = useMemo(() => new Map(myFields.map((f) => [f.id, f])), [myFields]);

  // 지운 현장(또는 다른 계정의 현장)은 목록을 받은 뒤 담은 목록에서 뺀다.
  useEffect(() => {
    if (!listReady || !prepHydrated) return;
    const kept = prepIds.filter((id) => fieldById.has(id));
    if (kept.length !== prepIds.length) useTripPrepStore.getState().setOrder(kept);
  }, [listReady, prepHydrated, prepIds, fieldById]);

  const selected = useMemo(
    () => (prepHydrated ? prepIds.map((id) => fieldById.get(id)).filter((f): f is Field => !!f) : []),
    [prepHydrated, prepIds, fieldById],
  );
  const selectedSet = useMemo(() => new Set(selected.map((f) => f.id)), [selected]);
  // 현장 목록을 받기 전엔 담은 목록 일부가 안 보일 수 있다 — 그 상태로 순서를 바꾸거나 출발하면 안 보이던 것이 빠진다.
  const ready = prepHydrated && listReady;
  // 현장 목록을 못 받았어도 담은 것 없이 출발(7-7)하거나 담은 목록을 비울 수는 있다.
  const canDepart = ready || (prepHydrated && !!listError && prepIds.length === 0);
  const canClear = ready || (prepHydrated && !!listError);

  const recent = useMemo(
    () =>
      myFields
        .filter((f) => f.recentVisitedAt && !selectedSet.has(f.id))
        .sort((a, b) => (b.recentVisitedAt ?? '').localeCompare(a.recentVisitedAt ?? ''))
        .slice(0, MAX_RECENT),
    [myFields, selectedSet],
  );

  const settings = useSharedMapSettings(myFields, 'filters');
  const { filterFields } = settings;

  const markers = useMemo<KakaoMapMarker[]>(() => {
    const bg: KakaoMapMarker[] = filterFields(myFields.filter((f) => !selectedSet.has(f.id) && hasCoords(f))).map((f) => {
      const kind = fieldActionStatus(f);
      return { id: f.id, lat: f.latitude, lng: f.longitude, label: fieldTitle(f), sublabel: districtOf(f.address), color: STATUS_PIN_COLOR[kind], pin: kind };
    });
    const mine: KakaoMapMarker[] = selected.filter(hasCoords).map((f, i) => {
      const kind = fieldActionStatus(f);
      return {
        id: f.id,
        lat: f.latitude,
        lng: f.longitude,
        label: fieldTitle(f),
        color: STATUS_PIN_COLOR[kind],
        pin: kind,
        order: i + 1,
        // 첫 목적지가 다음에 갈 곳 — 크게(Figma 6 의 1번 핀 38×52, 바닥 타원 없음) + 이름표.
        selected: i === 0,
        selectedSize: i === 0 ? 'next' : undefined,
        nameTag: i === 0 ? fieldTitle(f) : undefined,
      };
    });
    return [...bg, ...mine];
  }, [myFields, selected, selectedSet, filterFields]);

  const paths = useMemo(() => {
    const pts = [
      ...(myLoc ? [myLoc] : []),
      ...selected.filter(hasCoords).map((f) => ({ lat: f.latitude, lng: f.longitude })),
    ];
    return pts.length >= 2 ? [{ points: pts, tone: 'brand' as const, dotted: true }] : [];
  }, [myLoc, selected]);

  // 지도 맞춤: 내 위치 + 담은 목적지가 시트 위 보이는 영역에 들어오게(6·6-1). 담기·빼기 때마다 다시 맞춘다.
  const fitPoints = useMemo(
    () => [...(myLoc ? [myLoc] : []), ...selected.filter(hasCoords).map((f) => ({ lat: f.latitude, lng: f.longitude }))],
    [myLoc, selected],
  );
  const fitKey = fitPoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  const view = useMemo(
    () => (containerH ? viewFor(fitPoints, containerH, winW, insets.top) : null),
    // fitKey 가 좌표열을 대표한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitKey, containerH, winW, insets.top],
  );
  useEffect(() => {
    if (view) mapRef.current?.setView(view);
  }, [view]);

  const distanceM = useCallback(
    (a: LatLng | null, f: Field) => (a && hasCoords(f) ? haversineKm(a, { lat: f.latitude, lng: f.longitude }) * 1000 : null),
    [],
  );

  // === 담기·빼기·순서 ===
  const prep = useTripPrepStore.getState;
  const sortNearest = () => {
    if (selected.length < 2) return;
    const withC = selected.filter(hasCoords);
    const without = selected.filter((f) => !hasCoords(f));
    // 출발점: 내 위치, 모르면 첫 목적지.
    const start = myLoc ?? (withC[0] ? { lat: withC[0].latitude, lng: withC[0].longitude } : null);
    if (!start) return;
    const ordered = nearestNeighborOrder(
      start,
      withC.map((f) => ({ id: f.id, lat: f.latitude, lng: f.longitude })),
    );
    prep().setOrder([...ordered.map((n) => n.id), ...without.map((f) => f.id)]);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= selected.length) return;
    const ids = selected.map((f) => f.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    prep().setOrder(ids);
  };

  const depart = async () => {
    if (starting || busy) return;
    const ids = selected.map((f) => f.id);
    if (ids.length > TRIP_MAX_PLANNED_FIELDS) {
      await notice(`목적지는 ${TRIP_MAX_PLANNED_FIELDS}곳까지 담을 수 있어요`, '몇 곳을 뺀 뒤 다시 출발해 주세요.');
      return;
    }
    setStarting(true);
    const r = await startTrip(defaultTripTitle(new Date().toISOString()), ids);
    if (!r.ok) {
      setStarting(false);
      await notice('외근을 시작하지 못했어요', r.error);
      return;
    }
    if (myLoc) saveTripStartPoint(r.trip.id, myLoc);
    // 시작이 activeTripId 를 채운 배치(첫 화면이 1 → 7 로 바뀜)와 화면 이동을 한 배치에 섞지 않는다.
    // 떠나는 이 화면의 상태(starting)는 뒤집지 않는다.
    requestAnimationFrame(() => goToTabRoot('trips'));
  };

  const maxSheet =
    containerH != null && containerH > 0
      ? Math.max(SHEET_COLLAPSED + 1, containerH - (insets.top + space[8] + HEADER_H + space[8]))
      : null;
  const snapPoints = useMemo(() => (maxSheet ? [SHEET_COLLAPSED, maxSheet] : [SHEET_COLLAPSED]), [maxSheet]);
  // 현장 목록을 못 받았으면 담은 id 수로 센다(목록이 비어 보여도 [모두 빼기]로 비울 수 있게).
  const count = listError && prepHydrated ? prepIds.length : selected.length;

  return (
    <View style={styles.root} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      <KakaoMapWebView
        ref={mapRef}
        markers={markers}
        paths={paths}
        center={view ? { lat: view.lat, lng: view.lng } : undefined}
        initialLevel={view?.level ?? 5}
        myLocation={myLoc}
        baseMapType={settings.baseMapType}
      />

      <View style={[styles.header, { top: insets.top + space[8] }]} pointerEvents="box-none">
        <MapButton icon="arrow-left" size={52} accessibilityLabel="외근 준비 그만두기" onPress={() => safeBack(router)} />
        <SearchBar
          value=""
          placeholder="목적지 추가"
          onPressLauncher={() => router.push('/(tabs)/trips/fields' as never)}
          style={styles.search}
        />
        <MapButton icon="layers" size={52} dot={settings.changed} accessibilityLabel="지도 설정" onPress={settings.openSettings} />
      </View>

      <MapButton
        icon="locate"
        accessibilityLabel="내 위치"
        onPress={() => (view ? mapRef.current?.setView(view) : mapRef.current?.recenter(myLoc ?? undefined))}
        style={[styles.locate, { bottom: SHEET_COLLAPSED + space[16] }]}
      />

      {maxSheet ? (
        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose={false}
          handleComponent={SheetHandleSlot}
          backgroundStyle={styles.sheetBg}
          style={styles.sheetShadow}
        >
          {/* 명시적 height — gorhom 콘텐츠 높이 미적용(Fabric+reanimated 4) 우회(MapSheetLayout 주석). */}
          <View style={{ height: maxSheet - SHEET_HANDLE_H }}>
            <View style={styles.head}>
              <Text v2="heading" style={styles.flex} accessibilityRole="header">
                외근 목적지{' '}
                <Text v2="heading" tone={count > 0 ? 'link' : 'tertiary'}>
                  {count}
                </Text>
              </Text>
              {count > 0 ? (
                <View style={styles.actions}>
                  {reordering ? null : (
                    <>
                      <HeadAction label="모두 빼기" tone="secondary" disabled={!canClear} onPress={() => prep().setOrder([])} />
                      <View style={styles.sep} />
                      <HeadAction label="가까운 순으로" disabled={!ready} onPress={sortNearest} />
                      <View style={styles.sep} />
                    </>
                  )}
                  <HeadAction
                    label={reordering ? '완료' : '순서 변경'}
                    disabled={!ready}
                    onPress={() => setReordering((v) => !v)}
                  />
                </View>
              ) : null}
            </View>
            <BottomSheetScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: FOOTER_H + space[16] }}>
              {listError ? (
                <ErrorState message={listError} onRetry={() => void useFieldStore.getState().hydrate()} />
              ) : null}
              {count === 0 ? (
                // 6-1 담은 현장 없음
                <Text v2="bodyS.regular" tone="tertiary" style={styles.emptyText}>
                  갈 현장을 담거나, 담지 않고 출발해도 돼요. 가는 곳에서 체크인하면 이 외근에 기록돼요.
                </Text>
              ) : (
                <View style={styles.list}>
                  {selected.map((f, i) => {
                    const kind = fieldActionStatus(f);
                    // 첫 목적지는 내 위치에서, 그다음부터는 앞 목적지에서의 거리.
                    const prev = i > 0 ? selected[i - 1] : null;
                    const origin = prev ? (hasCoords(prev) ? { lat: prev.latitude, lng: prev.longitude } : null) : myLoc;
                    const d = distanceM(origin, f);
                    const from = i === 0 ? '현 위치에서' : `${i}번에서`;
                    return (
                      <View key={f.id} style={[styles.destRow, i > 0 && styles.divider]}>
                        <View style={[styles.orderDot, { backgroundColor: STATUS_PIN_COLOR[kind] }]}>
                          <Text v2="bodyS.extrabold" tone="inverse" numeric>
                            {i + 1}
                          </Text>
                        </View>
                        <View style={styles.flex}>
                          <Text v2="bodyL.semibold" numberOfLines={1}>
                            {fieldTitle(f)}
                          </Text>
                          <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                            <Text v2="caption.semibold" tone={STATUS_TONE[kind]}>
                              {STATUS_LABEL[kind]}
                            </Text>
                            {d != null ? ` ${from} ${formatDistanceM(d)}` : ''}
                          </Text>
                        </View>
                        {reordering ? (
                          <View style={styles.reorder}>
                            <Touchable
                              onPress={() => move(i, i - 1)}
                              disabled={i === 0}
                              accessibilityRole="button"
                              accessibilityLabel={`${fieldTitle(f)} 위로`}
                              style={[styles.iconBtn, i === 0 && styles.dim]}
                            >
                              <Icon name="chevron-down" size={20} color={c2.text.secondary} style={styles.up} />
                            </Touchable>
                            <Touchable
                              onPress={() => move(i, i + 1)}
                              disabled={i === selected.length - 1}
                              accessibilityRole="button"
                              accessibilityLabel={`${fieldTitle(f)} 아래로`}
                              style={[styles.iconBtn, i === selected.length - 1 && styles.dim]}
                            >
                              <Icon name="chevron-down" size={20} color={c2.text.secondary} />
                            </Touchable>
                          </View>
                        ) : (
                          <Touchable
                            onPress={() => prep().remove(f.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`${fieldTitle(f)} 목적지에서 빼기`}
                            style={styles.iconBtn}
                          >
                            <Icon name="close" size={18} color={c2.text.tertiary} />
                          </Touchable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
              {recent.length > 0 ? (
                <View style={styles.section}>
                  <Text v2="bodyS.bold" tone="secondary" style={styles.sectionTitle}>
                    최근 방문한 현장
                  </Text>
                  {recent.map((f, i) => {
                    const d = distanceM(myLoc, f);
                    const meta = [d != null ? formatDistanceM(d) : null, f.recentVisitedAt ? `${fmtMonthDay(f.recentVisitedAt)} 방문` : null]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <FieldSearchRow
                        key={f.id}
                        title={fieldTitle(f)}
                        status={fieldActionStatus(f)}
                        meta={meta}
                        added={false}
                        onPress={() => router.push({ pathname: '/(tabs)/trips/fields/[id]', params: { id: f.id } } as never)}
                        onToggle={() => prep().add([f.id])}
                        divider={i > 0}
                      />
                    );
                  })}
                </View>
              ) : null}
            </BottomSheetScrollView>
          </View>
        </BottomSheet>
      ) : null}

      {/* 시트 밖에 둔다 — 시트 안에 두면 gorhom pan 이 버튼 터치를 가로챈다. */}
      <BottomActionBar absolute safeArea={false} style={styles.footer}>
        <Button2 icon="navigation" onPress={() => void depart()} loading={starting} disabled={!canDepart} fullWidth>
          출발
        </Button2>
      </BottomActionBar>
      {settings.sheet}
    </View>
  );
}

function HeadAction({
  label,
  onPress,
  tone = 'link',
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'link' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Touchable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.headAction, disabled && styles.dim]}>
      <Text v2="bodyS.semibold" tone={tone}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.muted },
  flex: { flex: 1 },
  header: {
    position: 'absolute',
    left: space[16],
    right: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  search: { flex: 1 },
  locate: { position: 'absolute', right: space[16] },
  sheetBg: {
    backgroundColor: c2.bg.canvas,
    borderTopLeftRadius: radius2['2xl'],
    borderTopRightRadius: radius2['2xl'],
  },
  sheetShadow: { ...elevation2.sheet, borderTopLeftRadius: radius2['2xl'], borderTopRightRadius: radius2['2xl'] },
  // Figma: 제목 줄(44)은 시트 위 22.
  head: {
    height: 44,
    marginTop: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space[20],
    paddingRight: space[8],
  },
  actions: { flexDirection: 'row', alignItems: 'center' },
  headAction: { height: 44, paddingHorizontal: space[6], justifyContent: 'center' },
  sep: { width: 1, height: 14, backgroundColor: c2.bg.placeholder },
  emptyText: { paddingHorizontal: space[20], paddingTop: space[4], paddingBottom: space[8] },
  list: { paddingLeft: space[20], paddingRight: space[8] },
  destRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  orderDot: { width: 28, height: 28, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  reorder: { flexDirection: 'row' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  up: { transform: [{ rotate: '180deg' }] },
  dim: { opacity: 0.3 },
  section: { paddingHorizontal: space[20], paddingTop: space[10] },
  sectionTitle: { paddingBottom: space[2] },
  footer: {
    paddingTop: space[10],
    paddingBottom: 13,
    borderTopColor: c2.border.subtle,
    backgroundColor: c2.bg.canvas,
  },
});

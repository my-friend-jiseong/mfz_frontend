import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { useReportStore } from '@/stores/reportStore';
import { useLocationPermissionStore } from '@/stores/locationPermissionStore';
import { ErrorState } from '@/components/ErrorState';
import { MapDashboard } from '@/components/MapDashboard';
import { LocationPermissionSheet } from '@/components/map/LocationPermissionSheet';
import { TripHistoryRow } from '@/components/trips/TripHistoryRow';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { SheetHandle, useSheetMountConfigs, SHEET_SNAP } from '@/components/ui/AppSheet';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTripReportStates } from '@/utils/reportStatus';
import { openReportForTrip } from '@/utils/reportEntry';
import { isGeolocationDisabled } from '@/utils/geolocation';
import { tripHistoryGroup } from '@/utils/tripFormat';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import type { Trip } from '@/types/entities';

// 1 지도: 접힌 시트 높이(외근 시작 줄 포함). Figma 634:3004 는 탭 바 위 304.
export const SHEET_COLLAPSED = 304;
// 지도 위 검색창(52) — 시트를 끝까지 올려도 이 아래(+8)에서 멈춘다(Figma 2: 검색창 아래 8).
const SEARCH_BAR_H = 52;
// 외근 시작 줄: 위 10 + 버튼 56 + 아래 13(Figma 1 'Frame' 79).
const FOOTER_H = 79;
// SheetHandle 높이: 위 8 + 4 + 아래 8.
const SHEET_HANDLE_H = 20;

// gorhom 이 넘기는 시트 상태 props 는 쓰지 않는다.
const SheetHandleSlot = () => <SheetHandle />;

type Row =
  | { kind: 'header'; key: string; title: string; first: boolean }
  | { kind: 'trip'; key: string; trip: Trip; divider: boolean };

/**
 * 1 지도(외근 탭 첫 화면, 외근 전) — 지도 + 외근 내역 시트 + [외근 시작].
 * 2 외근 내역은 같은 시트를 끝까지 올린 모습([전체 보기] 또는 끌어올리기), 2-1 은 외근 0건.
 * 검색·필터는 2차에서 뺐다(결정 기록). 검색창은 4 현장 검색으로 가는 입구다.
 */
export default function TripsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const allTrips = useTripStore((s) => s.trips);
  const listStatus = useTripStore((s) => s.listStatus);
  const listError = useTripStore((s) => s.listError);
  const allVisits = useVisitStore((s) => s.visits);
  const sheetRef = useRef<BottomSheet>(null);
  const [expanded, setExpanded] = useState(false);
  const [containerH, setContainerH] = useState<number | null>(null);

  // 보고서는 이 세션 안에서 생긴다(외근 상세 → 보고서 작성 → 돌아옴) — 포커스마다 받아 배지를 맞춘다.
  useFocusEffect(
    useCallback(() => {
      void useReportStore.getState().hydrate();
    }, []),
  );

  const trips = useMemo(
    () =>
      userId
        ? allTrips.filter((t) => t.workerId === userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [],
    [allTrips, userId],
  );

  const tripIds = useMemo(() => trips.map((t) => t.id), [trips]);
  const reportStates = useTripReportStates(tripIds);

  // 방문 수 — 상세를 받은 외근은 visitStore, 아니면 목록 응답의 visitCount.
  const visitCountByTrip = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of allVisits) m.set(v.tripId, (m.get(v.tripId) ?? 0) + 1);
    return m;
  }, [allVisits]);

  // 묶음 머리와 행을 한 배열로 — SectionList 는 웹 gorhom 에서 스크롤 노드를 못 찾아 죽는다(예전 주석, 실측).
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last: string | null = null;
    for (const t of trips) {
      const g = tripHistoryGroup(t.startedAt);
      const newGroup = g !== last;
      if (newGroup) {
        out.push({ kind: 'header', key: `h:${g}`, title: g, first: last === null });
        last = g;
      }
      out.push({ kind: 'trip', key: `t:${t.id}`, trip: t, divider: !newGroup });
    }
    return out;
  }, [trips]);

  const openTrip = useCallback((id: string) => router.push(`/(tabs)/trips/${id}` as never), [router]);
  const writeReport = useCallback((id: string) => void openReportForTrip(router, id), [router]);

  // 외근 시작 — 위치 권한이 꺼져 있으면 1-2 를 한 번 보인다. 위치는 외근의 필수 조건이 아니라(결정)
  // 허용하든 [나중에]·닫기든 이어서 시작한다.
  const pendingStartRef = useRef(false);
  // 6 외근 준비.
  const goStart = useCallback(() => router.push('/(tabs)/trips/prep' as never), [router]);
  const startTrip = async () => {
    if (isGeolocationDisabled()) {
      goStart();
      return;
    }
    const store = useLocationPermissionStore.getState();
    const status = store.status ?? (await store.refresh());
    if (status === 'granted') {
      goStart();
      return;
    }
    pendingStartRef.current = true;
    store.openSheet();
  };
  const onPermissionDone = () => {
    if (!pendingStartRef.current) return;
    pendingStartRef.current = false;
    // 시트를 닫는 상태 변경과 화면 이동을 한 배치에 섞지 않는다.
    setTimeout(goStart, 0);
  };
  const onLocationOff = useCallback(() => {
    pendingStartRef.current = false;
    useLocationPermissionStore.getState().openSheet();
  }, []);

  const maxSheet =
    containerH != null && containerH > 0
      ? Math.max(SHEET_COLLAPSED + 1, containerH - (insets.top + space[8] + SEARCH_BAR_H + space[8]))
      : null;
  const sheetMountConfigs = useSheetMountConfigs(!!maxSheet);
  const snapPoints = useMemo(() => (maxSheet ? [SHEET_COLLAPSED, maxSheet] : [SHEET_COLLAPSED]), [maxSheet]);

  const empty = trips.length === 0 && listStatus !== 'loading' && listStatus !== 'error';
  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'header' ? (
        <Text v2="bodyS.bold" tone="secondary" style={[styles.group, !item.first && styles.groupNext]}>
          {item.title}
        </Text>
      ) : (
        <TripHistoryRow
          trip={item.trip}
          visitCount={visitCountByTrip.get(item.trip.id) ?? item.trip.visitCount ?? 0}
          stage={reportStates.get(item.trip.id)?.stage ?? 'checking'}
          divider={item.divider}
          onPress={openTrip}
          onWriteReport={writeReport}
        />
      ),
    [visitCountByTrip, reportStates, openTrip, writeReport],
  );

  return (
    <View style={styles.root} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      <MapDashboard
        keepGlobalChrome
        legendBottomInset={SHEET_COLLAPSED}
        v2={{
          // 4 현장 검색(지도 위 시트).
          onSearchPress: () => router.push('/(tabs)/trips/fields' as never),
          onLocationOff,
          locateBottom: SHEET_COLLAPSED + space[16],
        }}
      />
      {/* 높이를 재기 전엔 시트를 그리지 않는다 — snapPoints 를 마운트 뒤 바꾸면 gorhom 이 시트를 엉뚱한 곳에 둔다
          (MapSheetLayout 주석, 실측). */}
      {maxSheet ? (
        <BottomSheet
          // 첫 화면이 뜰 때 시트만 따로 아래에서 올라오지 않게 — 지도와 함께 바로 그린다(useSheetMountConfigs).
          animateOnMount={false}
          animationConfigs={sheetMountConfigs}
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose={false}
          onChange={(i) => setExpanded(i === 1)}
          handleComponent={SheetHandleSlot}
          backgroundStyle={styles.sheetBg}
          style={styles.sheetShadow}
        >
          {/* 명시적 height — gorhom 콘텐츠 높이 미적용(Fabric+reanimated 4) 우회(MapSheetLayout 주석). */}
          <View style={{ height: maxSheet - SHEET_HANDLE_H }}>
            <View style={styles.head}>
              <Text v2="heading" style={styles.flex} accessibilityRole="header">
                외근 내역
              </Text>
              {!expanded && !empty && trips.length > 0 ? (
                <Touchable onPress={() => sheetRef.current?.snapToIndex(1, SHEET_SNAP)} accessibilityRole="button" style={styles.all}>
                  <Text v2="bodyS.semibold" tone="link">
                    전체 보기
                  </Text>
                </Touchable>
              ) : null}
            </View>
            <BottomSheetFlatList
              data={rows}
              keyExtractor={(r) => r.key}
              renderItem={renderItem}
              style={styles.flex}
              contentContainerStyle={{ paddingBottom: FOOTER_H + space[16] }}
              ListEmptyComponent={
                listStatus === 'loading' && allTrips.length === 0 ? (
                  <View style={styles.skeletons}>
                    <SkeletonCard />
                    <SkeletonCard />
                  </View>
                ) : listStatus === 'error' && allTrips.length === 0 ? (
                  <ErrorState message={listError} onRetry={() => void useTripStore.getState().hydrate()} />
                ) : (
                  // 2-1 외근 0건(Figma 634:3131)
                  <View style={styles.empty}>
                    <Text v2="bodyL.bold" style={styles.center}>
                      아직 외근이 없어요
                    </Text>
                    <Text v2="bodyS.regular" tone="tertiary" style={styles.center}>
                      {'외근을 시작해 갈 현장을 담고 기록하면\n여기에 쌓여요.'}
                    </Text>
                  </View>
                )
              }
            />
          </View>
        </BottomSheet>
      ) : null}
      {/* 시트 밖에 둔다 — 시트 안에 두면 gorhom pan 이 버튼 터치를 가로챈다. 모양은 시트 맨 아래 줄과 같다. */}
      <BottomActionBar absolute safeArea={false} style={styles.footer}>
        <Button2 icon="play" onPress={() => void startTrip()} fullWidth>
          외근 시작
        </Button2>
      </BottomActionBar>
      <LocationPermissionSheet onDone={onPermissionDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.muted },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  sheetBg: {
    backgroundColor: c2.bg.canvas,
    borderTopLeftRadius: radius2['2xl'],
    borderTopRightRadius: radius2['2xl'],
  },
  sheetShadow: { ...elevation2.sheet, borderTopLeftRadius: radius2['2xl'], borderTopRightRadius: radius2['2xl'] },
  // Figma: 제목 줄(44)은 시트 위 22 — 손잡이 영역(20) 아래 2.
  head: {
    height: 44,
    marginTop: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space[20],
    paddingRight: space[12],
  },
  all: { height: 44, paddingHorizontal: space[8], justifyContent: 'center' },
  group: { paddingHorizontal: space[20], paddingTop: space[4], paddingBottom: space[4] },
  groupNext: { paddingTop: space[16] },
  skeletons: { gap: space[12], paddingHorizontal: space[20], paddingTop: space[8] },
  empty: { alignItems: 'center', gap: space[8], paddingTop: 54, paddingHorizontal: space[20] },
  footer: {
    paddingTop: space[10],
    paddingBottom: 13,
    borderTopColor: c2.border.subtle,
    backgroundColor: c2.bg.canvas,
  },
});

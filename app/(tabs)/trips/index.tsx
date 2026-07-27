import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useReportStore } from '@/stores/reportStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { TripCard } from '@/components/trips/TripCard';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { useHideOnScroll } from '@/components/ui/useHideOnScroll';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import {
  durationMinutes,
  fmtDate,
  fmtMinutes,
  isThisWeek,
  tripDateGroup,
} from '@/utils/datetime';
import type { Destination, Trip, Visit } from '@/types/entities';

// 외근 제목 = title 우선, 없으면 시작일 날짜(카드에 보이는 제목과 동일).
// 목록 검색이 이 값과 카드 제목을 함께 쓰도록 통일 — '보이는 제목 = 검색 대상'.
const tripTitle = (t: Trip) => (t.title?.trim() ? t.title.trim() : fmtDate(t.startedAt));

// 목록 행 — 날짜 그룹 헤더와 외근 카드를 한 배열에 섞어 FlatList 하나로 그린다(아래 rows 주석 참고).
type TripRow =
  | { kind: 'header'; title: string }
  | { kind: 'trip'; trip: Trip };

// 외근의 현장 id 를 방문 순서대로. 계획 목적지(order 순)를 우선 쓰고, 거기 없는 현장은
// 실제 방문(visitedAt 순)으로 메운다 — destinations 가 비어 있는 세션에서도 지도가 비지 않도록.
function resolveTripFieldIds(
  tripId: string,
  destinations: Destination[],
  visits: Visit[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (fieldId: string) => {
    if (!fieldId || seen.has(fieldId)) return;
    seen.add(fieldId);
    ids.push(fieldId);
  };
  destinations
    .filter((d) => d.tripId === tripId)
    .sort((a, b) => a.order - b.order)
    .forEach((d) => push(d.fieldId));
  visits
    .filter((v) => v.tripId === tripId)
    .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
    .forEach((v) => push(v.fieldId));
  return ids;
}

export default function TripsList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allTrips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const allVisits = useVisitStore((s) => s.visits);
  const allReports = useReportStore((s) => s.reports);

  const [search, setSearch] = useState('');

  // 보고서 마스터 로드 — 카드의 '보고서' 배지 판정에만 쓴다. 목록 1회 페치로
  // trip 당 추가 요청 없이 tripId 매칭 (fields/index.tsx 의 categoryStore.hydrate 와 동일 패턴).
  useEffect(() => {
    void useReportStore.getState().hydrate();
  }, []);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  const query = search.trim().toLowerCase();
  const trips = useMemo(
    () => (query ? myTrips.filter((t) => tripTitle(t).toLowerCase().includes(query)) : myTrips),
    [myTrips, query],
  );

  // tripId → visit 카운트 Map — renderItem 의 per-row .filter (O(N×M)) 제거.
  // allVisits 가 바뀔 때만 재계산. 단 visitStore 는 각 외근 loadDetail 시에만 채워지므로,
  // 탭 첫 진입(refreshList 만 돈 상태)에선 비어 있다 → 카운트가 있는 trip 만 여기 등재되고,
  // 없는 trip 은 list API 의 item.visitCount 로 폴백(visitsOf 참고).
  const visitCountByTrip = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of allVisits) m.set(v.tripId, (m.get(v.tripId) ?? 0) + 1);
    return m;
  }, [allVisits]);
  const visitsOf = (t: Trip) => visitCountByTrip.get(t.id) ?? t.visitCount ?? 0;

  // 보고서가 붙은 외근 id — Report.tripId 는 nullable(외근 없이 만든 보고서).
  const reportedTripIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of allReports) if (r.tripId) s.add(r.tripId);
    return s;
  }, [allReports]);

  // 상단 요약 — 검색 결과가 아니라 '이번 주 내가 뭘 했나' 를 답한다. 그래서 검색 필터
  // 이전 값(myTrips)으로 집계. 검색 중엔 아래에서 결과 건수 문구로 대체된다.
  const weekStats = useMemo(() => {
    const inWeek = myTrips.filter((t) => isThisWeek(t.startedAt));
    return {
      count: inWeek.length,
      visits: inWeek.reduce(
        (n, t) => n + (visitCountByTrip.get(t.id) ?? t.visitCount ?? 0),
        0,
      ),
      minutes: inWeek.reduce(
        (n, t) => n + durationMinutes(t.startedAt, t.endedAt),
        0,
      ),
    };
  }, [myTrips, visitCountByTrip]);

  // 날짜 그룹 섹션 — trips 가 startedAt 내림차순이라 같은 그룹은 연속으로 붙는다.
  // 검색 중엔 그룹핑을 끈다: 검색은 '찾기'라 구간 훑기용 헤더가 잡음이 된다.
  // 날짜 그룹 헤더를 목록 행으로 평탄화 — trips 가 startedAt 내림차순이라 같은 그룹은 연속으로 붙는다.
  // 검색 중엔 그룹핑을 끈다: 검색은 '찾기'라 구간 훑기용 헤더가 잡음이 된다.
  //
  // ★ SectionList 를 쓰지 않는 이유 (웹 크래시, 실측):
  //   gorhom 은 웹에서 스크롤 DOM 노드를 findNodeHandle.web 으로 찾는데 _findNodeHandle →
  //   getNativeScrollRef() → _scrollRef 순으로 시도한다. RN SectionList 는 getScrollableNode()
  //   만 노출해 셋 다 실패 → 컴포넌트 인스턴스를 그대로 반환 → addEventListener 호출에서
  //   "element.addEventListener is not a function" 으로 앱이 죽는다(외근 탭이 첫 화면이라 진입 즉시).
  //   FlatList 는 getNativeScrollRef/_scrollRef 를 직접 가져 정상. gorhom 에 BottomSheetFlatList
  //   와 달리 SectionList 의 .web 변형이 없는 것도 같은 이유. 네이티브는 reanimated 경로라 무관.
  const rows = useMemo<TripRow[]>(() => {
    if (query) return trips.map((trip) => ({ kind: 'trip' as const, trip }));
    const out: TripRow[] = [];
    let lastGroup: string | null = null;
    for (const t of trips) {
      const g = tripDateGroup(t.startedAt);
      if (g !== lastGroup) {
        out.push({ kind: 'header', title: g });
        lastGroup = g;
      }
      out.push({ kind: 'trip', trip: t });
    }
    return out;
  }, [trips, query]);

  // hide-on-scroll — Redirect 분기보다 위에서 호출(훅 순서 고정).
  const { onScroll, visible } = useHideOnScroll();

  // === 지도 포커스 ===
  // 목록은 배경 지도에 내 현장 전체를 깔지만, 카드와 지도가 아무 관계도 없어 지도가 장식이었다.
  // 카드의 지도 버튼 → 그 외근의 현장만 남기고 순번·동선까지 그린다(재탭 시 해제).
  const [focusTripId, setFocusTripId] = useState<string | null>(null);
  const [mapLoadingId, setMapLoadingId] = useState<string | null>(null);
  const allDestinations = useDestinationStore((s) => s.destinations);

  // 핸들러가 '현재 포커스'를 읽어야 하는데 state 를 deps 에 넣으면 콜백 identity 가 매번 바뀌어
  // TripCard memo 가 무력화된다. ref 를 진실값으로 두고 state 는 렌더용으로만 쓴다.
  // (setState updater 로 읽는 방법은 안 된다 — updater 는 다음 렌더에 실행돼 값이 늦게 온다)
  const focusTripIdRef = useRef<string | null>(null);
  const setFocus = useCallback((next: string | null) => {
    focusTripIdRef.current = next;
    setFocusTripId(next);
  }, []);

  // 계획 목적지(order 순) 우선, 누락분은 방문(visitedAt 순)으로 보완 — trips/[id].tsx 와 동일 규칙.
  // destinations 는 서버 하이드레이트 전엔 비어 있을 수 있어 visit 폴백이 필요하다.
  const focusFieldIds = useMemo(() => {
    if (!focusTripId) return undefined;
    return resolveTripFieldIds(focusTripId, allDestinations, allVisits);
  }, [focusTripId, allDestinations, allVisits]);

  const handleFocusMap = useCallback(
    async (tripId: string) => {
      // 토글 — 이미 이 외근을 보고 있으면 해제.
      if (focusTripIdRef.current === tripId) {
        setFocus(null);
        return;
      }
      setMapLoadingId(tripId);
      // 목록 진입 시점엔 이 외근의 목적지·방문이 로컬에 없다 → 탭한 1건만 상세 페치.
      // (카드마다 미리 부르면 목록 진입에 N개 요청이 터진다)
      await useTripStore.getState().loadDetail(tripId);
      setMapLoadingId(null);
      const ids = resolveTripFieldIds(
        tripId,
        useDestinationStore.getState().destinations,
        useVisitStore.getState().visits,
      );
      if (ids.length === 0) {
        // 침묵하는 무반응 대신 이유를 말한다 — 강제 종료된 외근 등 실제로 있는 케이스.
        Alert.alert(
          '지도에 표시할 현장이 없습니다',
          '이 외근에는 기록된 목적지나 방문이 없습니다.',
        );
        return;
      }
      setFocus(tripId);
    },
    [setFocus],
  );

  // TripCard 에 넘길 stable 콜백 — id 를 인자로 받아 카드마다 새 클로저를 만들지 않는다.
  const openTrip = useCallback(
    (tripId: string) => router.push(`/(tabs)/trips/${tripId}` as never),
    [router],
  );
  const focusMap = useCallback(
    (tripId: string) => void handleFocusMap(tripId),
    [handleFocusMap],
  );

  // 진행 중인 외근이 있으면 외근 탭은 그 외근의 방문 현장 화면(active)으로 직행.
  // 사용자가 외근 탭을 누를 때 "지금 무슨 현장 가는 거였지" 즉시 확인할 수 있도록.
  if (activeTripId !== null) {
    return <Redirect href="/(tabs)/trips/active" />;
  }

  return (
    // 외근 탭 배경 지도도 '현장' 탭과 동일하게 내 현장 전체를 깐다(mapFieldIds 미지정 = 전체).
    // 표시 설정(히트맵 등)은 mapSettingsStore 로 공유되어 탭 간 같은 배경 지도를 유지.
    // StickyBottomBar 는 '현장' 탭과 동일하게 MapSheetLayout(시트 콘텐츠) 안에 둔다.
    <MapSheetLayout
      title="외근 내역"
      mapFieldIds={focusFieldIds}
      routeFieldIds={focusFieldIds}
      collapseOnScopeChange
    >
      <View style={styles.toolbar}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="제목 검색"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          leftSlot={<Ionicons name="search" size={18} color={colors.textMuted} />}
        />
        {query ? (
          <View style={styles.summary}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <Text variant="caption" weight="semibold" color="textMuted">
              검색 결과 {trips.length}건
            </Text>
          </View>
        ) : myTrips.length > 0 ? (
          <View style={styles.summary}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text variant="caption" weight="semibold" color="textMuted">
              {weekStats.count === 0
                ? '이번 주 외근 없음'
                : `이번 주 외근 ${weekStats.count}건 · 방문 ${weekStats.visits}곳 · ${fmtMinutes(weekStats.minutes)}`}
            </Text>
          </View>
        ) : null}
      </View>
      <BottomSheetFlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === 'header' ? `h:${row.title}` : `t:${row.trip.id}`
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View style={styles.groupHeader}>
              <Text variant="caption" weight="bold" color="textMuted">
                {item.title}
              </Text>
            </View>
          ) : (
            <TripCard
              trip={item.trip}
              title={tripTitle(item.trip)}
              visitCount={visitsOf(item.trip)}
              plannedCount={item.trip.siteCount ?? null}
              hasReport={reportedTripIds.has(item.trip.id)}
              onPress={openTrip}
              onFocusMap={focusMap}
              mapFocused={focusTripId === item.trip.id}
              mapLoading={mapLoadingId === item.trip.id}
            />
          )
        }
        style={sheetScrollableStyle}
        contentContainerStyle={styles.list}
        // gorhom 은 onScroll 을 public 타입에서 제외하지만 런타임엔 useScrollHandler 로 전달함.
        {...({ onScroll } as object)}
        ListEmptyComponent={
          <EmptyState
            icon={query ? 'search-outline' : 'briefcase-outline'}
            title={query ? '검색 결과가 없습니다' : '외근 기록이 없습니다'}
            description={
              query ? '제목을 다시 입력해보세요' : '아래 버튼을 눌러 첫 외근을 시작하세요'
            }
          />
        }
      />
      <StickyBottomBar visible={visible}>
        <Button
          onPress={() => router.push('/(tabs)/trips/new/select' as never)}
          size="lg"
          fullWidth
          leftIcon="play-circle"
        >
          외근 시작
        </Button>
      </StickyBottomBar>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  list: { padding: spacing.lg, paddingBottom: 120 },
  // 날짜 그룹 구분선. 첫 그룹이 목록 맨 위에 붙지 않도록 상단 여백을 조금 더 준다.
  groupHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
});

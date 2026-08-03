import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useReportStore } from '@/stores/reportStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { TripCard } from '@/components/trips/TripCard';
import {
  TripFilterBar,
  type TripReportFilter,
} from '@/components/trips/TripFilterBar';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { useHideOnScroll } from '@/components/ui/useHideOnScroll';
import { colors } from '@/theme/colors';
import { listBottomInset, spacing } from '@/theme/spacing';
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
  // 필터 — 기간(시작일)·보고 여부. 둘 다 클라이언트 필터(trips API 는 필터 파라미터가 없다).
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [reported, setReported] = useState<TripReportFilter>(null);
  const hasFilter = fromDate !== null || toDate !== null || reported !== null;

  // 보고서 마스터 로드 — 카드의 '보고서' 배지 판정에만 쓴다. 목록 1회 페치로
  // trip 당 추가 요청 없이 tripId 매칭.
  //
  // mount 가 아니라 focus 마다 — 보고서는 이 세션 안에서 생긴다(외근 정리 → 보고서 작성 →
  // 목록 복귀). mount 1회만 받으면 방금 만든 보고서가 배지에 안 뜨고 앱을 새로 켜야 보였다(실측).
  useFocusEffect(
    useCallback(() => {
      void useReportStore.getState().hydrate();
    }, []),
  );

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  const query = search.trim().toLowerCase();

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

  // 검색 + 필터 적용. 보고 여부는 카드 배지와 같은 판정(reportedTripIds)을 써서
  // "배지는 있는데 필터에선 안 걸린다" 는 어긋남이 생기지 않게 한다.
  // 기간은 시작일(startedAt) 기준 — 목록의 날짜 그룹핑과 같은 축이다.
  const trips = useMemo(() => {
    let out = myTrips;
    if (query) out = out.filter((t) => tripTitle(t).toLowerCase().includes(query));
    if (fromDate) out = out.filter((t) => t.startedAt.slice(0, 10) >= fromDate);
    if (toDate) out = out.filter((t) => t.startedAt.slice(0, 10) <= toDate);
    if (reported === 'reported') out = out.filter((t) => reportedTripIds.has(t.id));
    else if (reported === 'unreported') out = out.filter((t) => !reportedTripIds.has(t.id));
    return out;
  }, [myTrips, query, fromDate, toDate, reported, reportedTripIds]);

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
      // 목록의 지도 포커스는 메인 탭 안의 임시 상태 — 스코프가 걸려도 검색창·레이어 버튼과
      // 히트맵 등 표시 설정은 그대로 둔다(토글 한 번에 컨트롤이 사라지지 않게).
      keepGlobalChrome
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
        <TripFilterBar
          fromDate={fromDate}
          toDate={toDate}
          onDateRange={(f, t) => {
            setFromDate(f);
            setToDate(t);
          }}
          reported={reported}
          onReported={setReported}
          hasFilter={hasFilter}
          onResetAll={() => {
            setFromDate(null);
            setToDate(null);
            setReported(null);
          }}
        />
        {query || hasFilter ? (
          <View style={styles.summary}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <Text variant="caption" weight="semibold" color="textMuted">
              {query ? '검색 결과' : '필터 결과'} {trips.length}건
            </Text>
          </View>
        ) : myTrips.length > 0 ? (
          weekStats.count === 0 ? (
            <View style={styles.summary}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text variant="caption" weight="semibold" color="textMuted">
                이번 주 외근 없음
              </Text>
            </View>
          ) : (
            // 이 화면의 focal — 목록은 '찾기'용이고, 탭을 열었을 때 답이 필요한 질문은
            // "이번 주에 내가 얼마나 돌았나" 다 (강령 1·8). 이전엔 셋 다 caption(12) 한 줄에
            // 가운뎃점으로 붙어 있어 숫자가 라벨과 같은 크기였다.
            <View style={styles.weekStats}>
              <View style={styles.statCol}>
                <Text variant="caption" weight="semibold" color="textMuted">
                  이번 주 외근
                </Text>
                <Text variant="metricSm" color="primary">
                  {weekStats.count}
                </Text>
              </View>
              <View style={styles.statCol}>
                <Text variant="caption" weight="semibold" color="textMuted">
                  방문
                </Text>
                <Text variant="metricSm">{weekStats.visits}</Text>
              </View>
              <View style={styles.statCol}>
                <Text variant="caption" weight="semibold" color="textMuted">
                  누적 시간
                </Text>
                {/* 세 열은 크기를 같게 둔다. 한 열만 h3(18) 로 낮췄더니 컬럼 높이가
                    46 vs 50 이 되어 flex-end 정렬에서 이 열의 라벨만 4px 내려앉았다(실측).
                    위계는 색으로 충분하다 — 건수는 primary, 시간은 textMuted. */}
                <Text variant="metricSm" color="textMuted">
                  {fmtMinutes(weekStats.minutes)}
                </Text>
              </View>
            </View>
          )
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
              plannedCount={item.trip.destinationCount ?? null}
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
            icon={query || hasFilter ? 'search-outline' : 'briefcase-outline'}
            title={
              query || hasFilter ? '조건에 맞는 외근이 없습니다' : '외근 기록이 없습니다'
            }
            description={
              query || hasFilter
                ? '검색어나 필터를 바꿔보세요'
                : '아래 버튼을 눌러 첫 외근을 시작하세요'
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
  // 정렬 기준은 라벨 줄(위)이다. 바닥을 맞추면 숫자 크기가 다른 열의 라벨만 내려앉는다.
  // 카드 껍데기 없이 캔버스 위에 — 시트 안이라 세로가 귀하고, 이건 목록의 머리말이지
  // 또 하나의 카드가 아니다.
  weekStats: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  statCol: { gap: spacing.xs },
  list: { padding: spacing.lg, paddingBottom: listBottomInset },
  // 날짜 그룹 구분선. 첫 그룹이 목록 맨 위에 붙지 않도록 상단 여백을 조금 더 준다.
  groupHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
});

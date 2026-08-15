import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { ReportFilterBar } from '@/components/reports/ReportFilterBar';
import { useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { useHideOnScroll } from '@/components/ui/useHideOnScroll';
import { colors } from '@/theme/colors';
import { listBottomInset, spacing } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate, fmtTime } from '@/utils/datetime';
import type { Report, Trip } from '@/types/entities';

// 새 양식(2026-05-31 결정 §2): 외근 없이 작성 그룹 폐지. 모든 보고서는 tripId 필수.
// orphan(tripId 없거나 trips store 에 매칭 안 되는 경우) 도 동일한 trip-block 으로 흡수하되
// trip 정보 없으면 'trip 정보 없음' 헤더로 graceful 표시 (백엔드 race 안전망).
// 그룹 세 종류를 구분한다. 이전엔 뒤 둘을 한 덩어리로 묶어 '외근 정보 없음' 이라 적었는데,
// 실제로는 **외근이 있는데 로컬에 안 불러왔을 뿐**인 경우가 대부분이라 거짓 표기였다
// (실측 2026-07-29: 서버가 tripId 를 19/19 전부 채워 보내는데 화면은 15건을 '없음' 으로 표시).
//  - trip: 로컬 tripStore 에서 찾은 외근 — 날짜·시간·방문 수까지 보여주고 상세로 이동
//  - 'unloaded': tripId 는 있는데 store 에 없음(외근 목록 페이지네이션 밖) — 정보 미로드
//  - 'none': tripId 자체가 없음 — 구 양식 데이터
type Group =
  | { kind: 'trip'; trip: Trip; reports: Report[] }
  | { kind: 'unloaded'; trip: null; reports: Report[] }
  | { kind: 'none'; trip: null; reports: Report[] };

export default function ReportsIndex() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allReports = useReportStore((s) => s.reports);
  const refresh = useReportStore((s) => s.refresh);
  const listStatus = useReportStore((s) => s.listStatus);
  const listError = useReportStore((s) => s.listError);
  const allTrips = useTripStore((s) => s.trips);
  const visitsByTrip = useVisitStore((s) => s.byTrip);

  const [search, setSearch] = useState('');
  // 작성일 기간 필터 — 클라이언트 필터. reports API 가 fromDate/toDate 를 지원하지만
  // 목록이 이미 로컬에 전부 있어 서버 왕복을 추가할 이유가 없다.
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const hasFilter = fromDate !== null || toDate !== null;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo<Group[]>(() => {
    if (!userId) return [];
    const mine = allReports.filter((r) => r.creatorId === userId);
    const q = search.trim().toLowerCase();
    const matches = (r: Report) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      const day = r.createdAt.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    };

    const byTripId = new Map<string, Report[]>();
    const noTrip: Report[] = [];
    const unloaded: Report[] = [];
    mine.forEach((r) => {
      if (!matches(r)) return;
      if (!r.tripId) {
        // 신 양식에선 tripId 필수 — 구 양식 데이터만 이 분기.
        noTrip.push(r);
        return;
      }
      const arr = byTripId.get(r.tripId) ?? [];
      arr.push(r);
      byTripId.set(r.tripId, arr);
    });

    // 외근별 그룹 — trips 최신순. trips store 에 있는 trip 만 매칭.
    const matchedTripIds = new Set<string>();
    const tripGroups: Group[] = [];
    allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .forEach((t) => {
        const reports = byTripId.get(t.id);
        if (reports && reports.length > 0) {
          matchedTripIds.add(t.id);
          tripGroups.push({
            kind: 'trip',
            trip: t,
            reports: reports.sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          });
        }
      });

    // tripId 는 있는데 trips store 에 없는 보고서들 — 외근이 없는 게 아니라 **미로드**다.
    for (const [tripId, reports] of byTripId) {
      if (!matchedTripIds.has(tripId)) unloaded.push(...reports);
    }

    const byNewest = (a: Report, b: Report) => b.createdAt.localeCompare(a.createdAt);
    const result: Group[] = [...tripGroups];
    // 폴백 그룹은 맨 아래로 (의도된 흐름이 아니므로 눈에 덜 띄게).
    if (unloaded.length > 0) {
      result.push({ kind: 'unloaded', trip: null, reports: unloaded.sort(byNewest) });
    }
    if (noTrip.length > 0) {
      result.push({ kind: 'none', trip: null, reports: noTrip.sort(byNewest) });
    }
    return result;
  }, [allReports, allTrips, userId, search, fromDate, toDate]);

  const { onScroll, visible } = useHideOnScroll();

  return (
    <MapSheetLayout title="보고서">
      <View style={styles.toolbar}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="제목 검색"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          leftSlot={<Ionicons name="search" size={18} color={colors.textMuted} />}
        />
        <ReportFilterBar
          fromDate={fromDate}
          toDate={toDate}
          onDateRange={(f, t) => {
            setFromDate(f);
            setToDate(t);
          }}
          hasFilter={hasFilter}
          onResetAll={() => {
            setFromDate(null);
            setToDate(null);
          }}
        />
      </View>
      <BottomSheetFlatList
        data={groups}
        style={sheetScrollableStyle}
        keyExtractor={(g) => (g.trip ? `trip-${g.trip.id}` : g.kind)}
        renderItem={({ item }) => (
          <View style={styles.group}>
            {item.trip ? (
              <Pressable
                onPress={() =>
                  router.push(`/(tabs)/trips/${item.trip!.id}` as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`${fmtDate(item.trip.startedAt)} 외근 상세로 이동`}
                style={({ pressed }) => [
                  styles.tripHeaderRow,
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Ionicons name="briefcase-outline" size={16} color={colors.primary} />
                <View style={styles.tripHeaderTextWrap}>
                  <Text variant="bodySm" weight="bold" color="primary">
                    외근 · {fmtDate(item.trip.startedAt)}
                  </Text>
                  <Text variant="caption" color="textMuted" style={styles.tripHeaderMeta}>
                    {fmtTime(item.trip.startedAt)}
                    {item.trip.endedAt
                      ? `–${fmtTime(item.trip.endedAt)}`
                      : ' · 진행 중'}
                    {' · 방문 '}
                    {visitsByTrip(item.trip.id).length}건
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : (
              // 폴백 헤더. '없음' 과 '미로드' 를 구분해 적는다 — 외근이 있는데 없다고
              // 적으면 사용자가 데이터가 유실된 줄 안다(실측으로 드러난 거짓 표기).
              <View style={styles.orphanHeader}>
                <Ionicons
                  name={
                    item.kind === 'unloaded'
                      ? 'cloud-offline-outline'
                      : 'alert-circle-outline'
                  }
                  size={16}
                  color={colors.textMuted}
                />
                <Text variant="bodySm" weight="bold" color="textMuted">
                  {item.kind === 'unloaded'
                    ? '외근 정보 미로드'
                    : '외근 없이 작성된 보고서'}
                </Text>
              </View>
            )}
            {item.reports.map((r) => (
              <Card
                key={r.id}
                onPress={() => router.push(`/(tabs)/reports/${r.id}` as never)}
                style={styles.reportCard}
              >
                <View style={styles.reportHead}>
                  <Text variant="body" weight="bold" numberOfLines={2} style={styles.reportTitle}>
                    {r.title}
                  </Text>
                  {/* updatedAt 존재만 보면 배지가 모든 카드에 붙는다 — 백엔드가 생성
                      시각에도 updated_at 을 채우기 때문. 전부에 붙는 배지는 신호가 아니라
                      배경이라 3중 인코딩 어휘만 소모한다. 실제로 바뀐 것만 표시한다. */}
                  {r.updatedAt && r.updatedAt !== r.createdAt ? (
                    <Badge label="수정됨" tone="primary" />
                  ) : null}
                </View>
                <View style={styles.reportMetaRow}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textSubtle} />
                  <Text variant="caption" color="textMuted">{fmtDate(r.createdAt)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
        contentContainerStyle={styles.list}
        // gorhom 은 onScroll 을 public 타입에서 제외하지만 런타임엔 useScrollHandler 로 전달함.
        {...({ onScroll } as object)}
        // 로딩 중·조회 실패·진짜 없음 셋을 갈라 렌더한다 (강령 3).
        // loading/error 는 받아둔 데이터가 없을 때만 이긴다 — 이 스토어의 hydrate 는
        // 외근 탭 포커스마다 돌아서(trips/index) 오프라인 한 번이면 listStatus 가 'error'
        // 로 눌어붙는다. 그 상태로 기간 필터가 0건이면 "조건에 맞는 보고서가 없습니다" 가
        // 맞는데 ErrorState 가 덮어쓴다.
        ListEmptyComponent={
          allReports.length === 0 && listStatus === 'loading' ? (
            <LoadingState label="보고서를 불러오는 중" inline />
          ) : allReports.length === 0 && listStatus === 'error' ? (
            <ErrorState message={listError} onRetry={() => void refresh()} />
          ) : (
            <EmptyState
              icon={search || hasFilter ? 'search-outline' : 'document-text-outline'}
              title={
                search || hasFilter
                  ? '조건에 맞는 보고서가 없습니다'
                  : '작성된 보고서가 없습니다'
              }
              description={
                search || hasFilter
                  ? '검색어나 기간을 바꿔보세요'
                  : '아래 버튼으로 첫 보고서를 작성하세요'
              }
              action={
                !search && !hasFilter ? (
                  <Button
                    onPress={() => router.push('/(tabs)/reports/new' as never)}
                    leftIcon="document-text"
                  >
                    보고서 작성
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      <StickyBottomBar visible={visible}>
        <Button
          onPress={() => router.push('/(tabs)/reports/new' as never)}
          size="lg"
          fullWidth
          leftIcon="document-text"
        >
          보고서 작성
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
    // 검색창과 필터 사이 간격이 빠져 있어 둘이 붙어 있었다 — 현장·외근 탭 toolbar 와 동일하게.
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  list: { padding: spacing.lg, paddingBottom: listBottomInset },
  // 그룹 ↔ 그룹은 section tier(xl). 그룹 안(헤더↔카드, 카드↔카드)은 xs/sm 로 붙여
  // 어디까지가 한 외근인지 눈이 읽게 한다 (간격 리듬, 문서 2.1).
  group: { marginBottom: spacing.xl },
  tripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  tripHeaderTextWrap: { flex: 1 },
  tripHeaderMeta: { marginTop: spacing.xs },
  orphanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  reportCard: { marginBottom: spacing.sm },
  reportHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportTitle: { flex: 1 },
  reportMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { useHideOnScroll } from '@/components/ui/useHideOnScroll';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate, fmtTime } from '@/utils/datetime';
import type { Report, Trip } from '@/types/entities';

// 새 양식(2026-05-31 결정 §2): 외근 없이 작성 그룹 폐지. 모든 보고서는 tripId 필수.
// orphan(tripId 없거나 trips store 에 매칭 안 되는 경우) 도 동일한 trip-block 으로 흡수하되
// trip 정보 없으면 'trip 정보 없음' 헤더로 graceful 표시 (백엔드 race 안전망).
type Group = { trip: Trip | null; reports: Report[] };

export default function ReportsIndex() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allReports = useReportStore((s) => s.reports);
  const refresh = useReportStore((s) => s.refresh);
  const allTrips = useTripStore((s) => s.trips);
  const visitsByTrip = useVisitStore((s) => s.byTrip);

  const [search, setSearch] = useState('');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo<Group[]>(() => {
    if (!userId) return [];
    const mine = allReports.filter((r) => r.creatorId === userId);
    const q = search.trim().toLowerCase();
    const matches = (r: Report) =>
      !q || r.title.toLowerCase().includes(q);

    const byTripId = new Map<string, Report[]>();
    const unresolved: Report[] = [];
    mine.forEach((r) => {
      if (!matches(r)) return;
      if (!r.tripId) {
        // 신 양식에선 tripId 필수 — 과거 보고서만 이 분기. 'trip 정보 없음' 헤더로 흡수.
        unresolved.push(r);
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
            trip: t,
            reports: reports.sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          });
        }
      });

    // tripId 는 있는데 trips store 에 없는 보고서들 — unresolved 로 흡수 (페이지네이션·캐시 race).
    for (const [tripId, reports] of byTripId) {
      if (!matchedTripIds.has(tripId)) {
        unresolved.push(...reports);
      }
    }

    const result: Group[] = [...tripGroups];
    if (unresolved.length > 0) {
      // trip 정보 없는 보고서들 — 그룹 맨 아래로 (의도된 흐름 아닌 폴백이므로 눈에 덜 띄게).
      result.push({
        trip: null,
        reports: unresolved.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      });
    }
    return result;
  }, [allReports, allTrips, userId, search]);

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
      </View>
      <BottomSheetFlatList
        data={groups}
        style={sheetScrollableStyle}
        keyExtractor={(g) => (g.trip ? `trip-${g.trip.id}` : 'orphan')}
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
              // 신 양식에선 외근 필수 — 이 헤더는 trip 정보 race / 과거 데이터 폴백.
              <View style={styles.orphanHeader}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.textMuted} />
                <Text variant="bodySm" weight="bold" color="textMuted">
                  외근 정보 없음
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
                  {r.updatedAt ? (
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
        ListEmptyComponent={
          <EmptyState
            icon={search ? 'search-outline' : 'document-text-outline'}
            title={search ? '검색 결과가 없습니다' : '작성된 보고서가 없습니다'}
            description={
              search
                ? '제목을 다시 입력해보세요'
                : '아래 버튼으로 첫 보고서를 작성하세요'
            }
            action={
              !search ? (
                <Button
                  onPress={() => router.push('/(tabs)/reports/new' as never)}
                  leftIcon="document-text"
                >
                  보고서 작성
                </Button>
              ) : undefined
            }
          />
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
    backgroundColor: colors.background,
  },
  list: { padding: spacing.lg, paddingBottom: 120 },
  group: { marginBottom: spacing.lg },
  tripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  tripHeaderTextWrap: { flex: 1 },
  tripHeaderMeta: { marginTop: 2 },
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

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate, fmtTime } from '@/utils/datetime';
import type { Report, Trip } from '@/types/entities';


type Group = { trip: Trip; reports: Report[] };

export default function ReportsIndex() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allReports = useReportStore((s) => s.reports);
  const refresh = useReportStore((s) => s.refresh);
  const allTrips = useTripStore((s) => s.trips);
  const visitsByTrip = useVisitStore((s) => s.byTrip);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo<Group[]>(() => {
    if (!userId) return [];
    const mine = allReports.filter((r) => r.creatorId === userId);
    const byTripId = new Map<string, Report[]>();
    mine.forEach((r) => {
      if (!r.tripId) return;
      const arr = byTripId.get(r.tripId) ?? [];
      arr.push(r);
      byTripId.set(r.tripId, arr);
    });
    const result: Group[] = [];
    // 외근을 최신순으로 정렬하고, 보고서가 있는 것만 포함
    allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .forEach((t) => {
        const reports = byTripId.get(t.id);
        if (reports && reports.length > 0) {
          result.push({
            trip: t,
            reports: reports.sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          });
        }
      });
    return result;
  }, [allReports, allTrips, userId]);

  return (
    // sheet 공유 모드 — MapSheetLayout 의 race 가 근원에서 해결됐으므로 initialIndex 생략.
    <MapSheetLayout title="보고서">
      <BottomSheetFlatList
        data={groups}
        keyExtractor={(g) => String(g.trip.id)}
        renderItem={({ item }) => (
          <View style={styles.group}>
            <Pressable
              onPress={() =>
                router.push(`/(tabs)/trips/${item.trip.id}` as never)
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
                <Text style={styles.tripHeader}>
                  외근 · {fmtDate(item.trip.startedAt)}
                </Text>
                <Text style={styles.tripHeaderMeta}>
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
            {item.reports.map((r) => (
              <Card
                key={r.id}
                onPress={() => router.push(`/(tabs)/reports/${r.id}` as never)}
                style={styles.reportCard}
              >
                <View style={styles.reportHead}>
                  <Text style={styles.reportTitle} numberOfLines={2}>
                    {r.title}
                  </Text>
                  {r.updatedAt ? (
                    <Badge label="수정됨" tone="primary" />
                  ) : null}
                </View>
                <View style={styles.reportMetaRow}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textSubtle} />
                  <Text style={styles.reportMeta}>{fmtDate(r.createdAt)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="작성된 보고서가 없습니다"
            description="아래 버튼으로 외근에 연결된 보고서를 작성하세요"
          />
        }
      />
      <StickyBottomBar>
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
  tripHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  tripHeaderMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  reportCard: { marginBottom: spacing.sm },
  reportHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    lineHeight: lineHeight.base,
  },
  reportMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reportMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});

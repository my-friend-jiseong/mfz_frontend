import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Report, Trip } from '@/types/entities';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function summary(content: string, limit = 60) {
  const s = content.replace(/\s+/g, ' ').trim();
  return s.length > limit ? s.slice(0, limit) + '…' : s;
}

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
    const mine = allReports.filter(
      (r) => r.creatorId === userId && r.deletedAt === null,
    );
    const byTripId = new Map<string, Report[]>();
    mine.forEach((r) => {
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
              style={styles.tripHeaderRow}
            >
              <View style={styles.tripHeaderTextWrap}>
                <Text style={styles.tripHeader}>
                  외근 · {fmtDate(item.trip.startedAt)}
                </Text>
                <Text style={styles.tripHeaderMeta}>
                  {fmtTime(item.trip.startedAt)}
                  {item.trip.endedAt ? `–${fmtTime(item.trip.endedAt)}` : ' · 진행 중'}
                  {' · 방문 '}
                  {visitsByTrip(item.trip.id).length}건
                </Text>
              </View>
            </Pressable>
            {item.reports.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/(tabs)/reports/${r.id}` as never)}
                style={({ pressed }) => [
                  styles.reportCard,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.reportTitle}>{r.title}</Text>
                <Text style={styles.reportSummary} numberOfLines={2}>
                  {summary(r.content)}
                </Text>
                <Text style={styles.reportMeta}>
                  {fmtDate(r.createdAt)}
                  {r.updatedAt ? ` · 수정됨` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="작성된 보고서가 없습니다"
            description="아래 버튼으로 외근에 연결된 보고서를 작성하세요"
          />
        }
      />
      <View style={styles.fabRow}>
        <Pressable
          onPress={() => router.push('/(tabs)/reports/new' as never)}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Text style={styles.fabText}>📝 보고서 작성</Text>
        </Pressable>
      </View>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 120 },
  group: { marginBottom: spacing.lg },
  tripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  tripHeaderTextWrap: { flex: 1 },
  tripHeader: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  tripHeaderMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  reportTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.text,
  },
  reportSummary: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  reportMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  fabRow: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fab: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  fabText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  notice: {
    backgroundColor: colors.primary + '10',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
});

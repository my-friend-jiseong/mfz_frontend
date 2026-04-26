import { useEffect, useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = id ?? '';
  const router = useRouter();

  const allReports = useReportStore((s) => s.reports);
  const detailCache = useReportStore((s) => s.detailCache);
  const loadDetail = useReportStore((s) => s.loadDetail);
  const remove = useReportStore((s) => s.remove);
  const allTrips = useTripStore((s) => s.trips);
  const userId = useAuthStore((s) => s.user?.id);

  // 진입 시 백엔드에서 detail 페치 (목록은 contentPreview 만 갖고 있음)
  useEffect(() => {
    if (reportId) void loadDetail(reportId);
  }, [reportId, loadDetail]);

  const report = useMemo(
    () =>
      detailCache[reportId] ??
      allReports.find((r) => r.id === reportId && r.deletedAt === null),
    [detailCache, allReports, reportId],
  );
  const trip = useMemo(
    () => (report ? allTrips.find((t) => t.id === report.tripId) : undefined),
    [allTrips, report],
  );

  if (!report) {
    return (
      <MapSheetLayout title="보고서 상세" onBack={() => router.back()}>
        <EmptyState title="보고서를 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  const isOwner = userId === report.creatorId;

  const handleDelete = () => {
    const doDelete = async () => {
      const r = await remove(report.id);
      if (r.ok) {
        router.replace('/(tabs)/reports' as never);
      } else {
        Alert.alert('삭제 실패', r.error);
      }
    };
    if (Platform.OS === 'web') {
      if (confirm('이 보고서를 삭제할까요? (soft delete)')) void doDelete();
    } else {
      Alert.alert('보고서 삭제', '이 보고서를 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  };

  return (
    <MapSheetLayout
      title="보고서 상세"
      onBack={() => router.back()}
      initialIndex={2}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{report.title}</Text>

        {trip ? (
          <Pressable
            onPress={() => router.push(`/(tabs)/trips/${trip.id}` as never)}
            style={styles.tripLink}
          >
            <Text style={styles.tripLinkText}>
              연결 외근: #{trip.id} · {fmtDateTime(trip.startedAt)}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.meta}>
          작성: {fmtDateTime(report.createdAt)}
          {report.updatedAt ? ` · 수정: ${fmtDateTime(report.updatedAt)}` : ''}
        </Text>

        <View style={styles.contentBox}>
          <Text style={styles.content}>{report.content}</Text>
        </View>

        {isOwner ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                router.push(`/(tabs)/reports/${report.id}/edit` as never)
              }
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>수정</Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.dangerBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.actionText, styles.dangerText]}>삭제</Text>
            </Pressable>
          </View>
        ) : null}
      </BottomSheetScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  tripLink: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary + '10',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  tripLinkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  meta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  contentBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  content: {
    fontSize: fontSize.base,
    color: colors.text,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  actionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  dangerBtn: { borderColor: colors.danger + '40' },
  dangerText: { color: colors.danger },
  pressed: { opacity: 0.85 },
});

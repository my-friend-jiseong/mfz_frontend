import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
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
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { FieldReport } from '@/types/entities';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

// 현장별 전·중·후 사진 카드 (ERD v2: 보고서 본문 대체).
function FieldReportCard({ fr, fieldName }: { fr: FieldReport; fieldName?: string }) {
  const slots: Array<{ label: string; url?: string | null; caption?: string | null }> = [
    { label: '전', url: fr.beforePhotoUrl, caption: fr.beforePhotoCaption },
    { label: '중', url: fr.pendingPhotoUrl, caption: fr.pendingPhotoCaption },
    { label: '후', url: fr.afterPhotoUrl, caption: fr.afterPhotoCaption },
  ];
  const resolve = (raw: string) => (raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`);
  return (
    <View style={styles.frCard}>
      <Text style={styles.frTitle}>{fr.title || fieldName || '현장 보고'}</Text>
      <View style={styles.frSlots}>
        {slots.map((s) => (
          <View key={s.label} style={styles.frSlot}>
            <Text style={styles.frSlotLabel}>{s.label}</Text>
            {s.url ? (
              <Image source={{ uri: resolve(s.url) }} style={styles.frPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.frPhoto, styles.frPhotoEmpty]}>
                <Text style={styles.frPhotoEmptyText}>없음</Text>
              </View>
            )}
            {s.caption ? <Text style={styles.frCaption}>{s.caption}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
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
  const getField = useFieldStore((s) => s.getById);
  const userId = useAuthStore((s) => s.user?.id);

  const [deleting, setDeleting] = useState(false);

  // 진입 시 백엔드에서 detail 페치 (목록은 fieldReports 없음).
  useEffect(() => {
    if (reportId && !deleting) void loadDetail(reportId);
  }, [reportId, loadDetail, deleting]);

  const report = useMemo(
    () => detailCache[reportId] ?? allReports.find((r) => r.id === reportId),
    [detailCache, allReports, reportId],
  );
  const trip = useMemo(
    () => (report ? allTrips.find((t) => t.id === report.tripId) : undefined),
    [allTrips, report],
  );

  if (!report) {
    return (
      <MapSheetLayout title="보고서 상세" onBack={() => safeBack(router)}>
        <EmptyState
          title={deleting ? '보고서를 삭제 중입니다...' : '보고서를 찾을 수 없습니다'}
        />
      </MapSheetLayout>
    );
  }

  const isOwner = userId === report.creatorId;
  const fieldReports = report.fieldReports ?? [];

  const handleDelete = () => {
    const doDelete = async () => {
      setDeleting(true); // race 가드 — 삭제 중 detail 재페치 차단
      const r = await remove(report.id);
      if (r.ok) {
        router.replace('/(tabs)/reports' as never);
        return;
      }
      setDeleting(false);
      const raw = r.error ?? '';
      if (/이미 삭제|찾을 수 없는/.test(raw)) {
        router.replace('/(tabs)/reports' as never);
        return;
      }
      Alert.alert(
        '보고서 삭제 실패',
        raw || '보고서를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    };
    if (Platform.OS === 'web') {
      if (confirm('이 보고서를 삭제할까요?')) void doDelete();
    } else {
      Alert.alert('보고서 삭제', '이 보고서를 정말 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  };

  return (
    <MapSheetLayout
      title="보고서 상세"
      onBack={() => safeBack(router)}
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

        <Text style={styles.sectionLabel}>현장별 전·중·후</Text>
        {fieldReports.length === 0 ? (
          <Text style={styles.emptyFr}>등록된 현장 보고가 없습니다.</Text>
        ) : (
          fieldReports.map((fr) => (
            <FieldReportCard
              key={fr.id}
              fr={fr}
              fieldName={getField(fr.fieldId)?.address}
            />
          ))
        )}

        {report.outputFileUrl && report.outputFileUrl.trim() ? (
          <Pressable
            onPress={() => {
              const raw = report.outputFileUrl!.trim();
              const url = raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`;
              void Linking.openURL(url);
            }}
            style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
          >
            <Text style={styles.downloadBtnText}>📄 Word 파일 다운로드</Text>
          </Pressable>
        ) : null}

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
  sectionLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  emptyFr: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
  },
  frCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  frTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  frSlots: { flexDirection: 'row', gap: spacing.sm },
  frSlot: { flex: 1, alignItems: 'center' },
  frSlotLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 4,
  },
  frPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  frPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  frPhotoEmptyText: { fontSize: fontSize.xs, color: colors.textMuted },
  frCaption: {
    fontSize: fontSize.xs,
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
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
  downloadBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
  },
  downloadBtnText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
});

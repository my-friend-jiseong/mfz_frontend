import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
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
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDateTime } from '@/utils/datetime';
import type { FieldReport } from '@/types/entities';

// 현장별 전·중·후 사진 카드 (ERD v2: 보고서 본문 대체).
function FieldReportCard({
  fr,
  fieldName,
  onEdit,
  onDelete,
}: {
  fr: FieldReport;
  fieldName?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const slots: Array<{ label: string; url?: string | null; caption?: string | null }> = [
    { label: '전', url: fr.beforePhotoUrl, caption: fr.beforePhotoCaption },
    { label: '중', url: fr.pendingPhotoUrl, caption: fr.pendingPhotoCaption },
    { label: '후', url: fr.afterPhotoUrl, caption: fr.afterPhotoCaption },
  ];
  const resolve = (raw: string) =>
    raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`;
  return (
    <Card padding="md" style={styles.frCard}>
      <View style={styles.frHead}>
        <Text variant="bodySm" weight="bold" style={styles.frTitle}>
          {fr.title || fieldName || '현장 보고'}
        </Text>
        {onEdit || onDelete ? (
          <View style={styles.frHeadActions}>
            {onEdit ? (
              <Button onPress={onEdit} variant="ghost" size="sm" leftIcon="create-outline">
                수정
              </Button>
            ) : null}
            {onDelete ? (
              <Button onPress={onDelete} variant="ghost" size="sm" leftIcon="trash">
                삭제
              </Button>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.frSlots}>
        {slots.map((s) => (
          <View key={s.label} style={styles.frSlot}>
            <Text variant="caption" weight="bold" color="textMuted" style={styles.frSlotLabel}>
              {s.label}
            </Text>
            {s.url ? (
              <Image
                source={{ uri: resolve(s.url) }}
                style={styles.frPhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.frPhoto, styles.frPhotoEmpty]}>
                <Text variant="caption" color="textMuted">없음</Text>
              </View>
            )}
            {s.caption ? (
              <Text variant="caption" align="center" style={styles.frCaption}>
                {s.caption}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
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
  const removeFieldReport = useReportStore((s) => s.removeFieldReport);
  const allTrips = useTripStore((s) => s.trips);
  const getField = useFieldStore((s) => s.getById);
  const userId = useAuthStore((s) => s.user?.id);

  const [deleting, setDeleting] = useState(false);
  // store 가 id 별 fetch 진행 상태를 노출 — 로컬 가드 대신 단일 진실 출처 사용.
  const detailStatus = useReportStore((s) => s.detailStatus[reportId]);
  const fetchedRef = useRef<string | null>(null);

  // 진입 시 백엔드에서 detail 페치 (목록은 fieldReports 없음).
  useEffect(() => {
    if (!reportId || deleting) return;
    if (fetchedRef.current === reportId) return;
    fetchedRef.current = reportId;
    void loadDetail(reportId);
  }, [reportId, deleting, loadDetail]);

  const report = useMemo(
    () => detailCache[reportId] ?? allReports.find((r) => r.id === reportId),
    [detailCache, allReports, reportId],
  );
  const trip = useMemo(
    () => (report ? allTrips.find((t) => t.id === report.tripId) : undefined),
    [allTrips, report],
  );

  if (!report) {
    // 첫 진입 race 동안 LoadingState 노출, fetch 끝났는데도 null 이면 'not found'.
    return (
      <MapSheetLayout title="보고서 상세" onBack={() => safeBack(router)}>
        {deleting ? (
          <EmptyState icon="trash-outline" title="보고서를 삭제 중입니다" />
        ) : detailStatus === 'missing' ? (
          <EmptyState
            icon="document-text-outline"
            title="보고서를 찾을 수 없습니다"
            description="삭제됐거나 접근 권한이 없는 보고서입니다"
          />
        ) : (
          <LoadingState label="보고서 불러오는 중" />
        )}
      </MapSheetLayout>
    );
  }

  const isOwner = userId === report.creatorId;
  const fieldReports = report.fieldReports ?? [];

  const handleDeleteFr = (frId: string) => {
    const doDelete = async () => {
      const r = await removeFieldReport(report.id, frId);
      if (!r.ok) Alert.alert('현장 보고 삭제 실패', r.error);
    };
    if (Platform.OS === 'web') {
      if (confirm('이 현장 보고를 삭제할까요?')) void doDelete();
    } else {
      Alert.alert('현장 보고 삭제', '이 현장 보고를 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  };

  const handleDelete = () => {
    const doDelete = async () => {
      setDeleting(true);
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
        <Text variant="h2" weight="heavy">
          {report.title}
        </Text>

        {trip ? (
          <Pressable
            onPress={() => router.push(`/(tabs)/trips/${trip.id}` as never)}
            style={({ pressed }) => [
              styles.tripLink,
              pressed && { opacity: opacity.pressed },
            ]}
          >
            <Ionicons name="briefcase-outline" size={14} color={colors.primary} />
            <Text variant="bodySm" weight="semibold" color="primary">
              연결 외근: #{trip.id} · {fmtDateTime(trip.startedAt)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        ) : null}

        <Text variant="caption" color="textMuted" style={styles.meta}>
          작성: {fmtDateTime(report.createdAt)}
          {report.updatedAt ? ` · 수정: ${fmtDateTime(report.updatedAt)}` : ''}
        </Text>

        <View style={styles.sectionHead}>
          <Text variant="bodySm" weight="bold" color="textMuted">
            현장별 전·중·후
          </Text>
          {isOwner ? (
            <Button
              onPress={() =>
                router.push(`/(tabs)/reports/${report.id}/field-report` as never)
              }
              variant="secondary"
              size="sm"
              leftIcon="add"
            >
              현장 보고 추가
            </Button>
          ) : null}
        </View>
        {fieldReports.length === 0 ? (
          <Text variant="bodySm" color="textMuted" style={styles.emptyFr}>
            등록된 현장 보고가 없습니다.
          </Text>
        ) : (
          fieldReports.map((fr) => (
            <FieldReportCard
              key={fr.id}
              fr={fr}
              fieldName={getField(fr.fieldId)?.address}
              onEdit={
                isOwner
                  ? () =>
                      router.push(
                        `/(tabs)/reports/${report.id}/field-report?frId=${fr.id}` as never,
                      )
                  : undefined
              }
              onDelete={isOwner ? () => handleDeleteFr(fr.id) : undefined}
            />
          ))
        )}

        {report.outputFileUrl && report.outputFileUrl.trim() ? (
          <Button
            onPress={() => {
              const raw = report.outputFileUrl!.trim();
              const url = raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`;
              // web 에선 새 탭, 모바일은 외부 앱 — 실패 시 silent 종결되지 않도록 alert.
              if (Platform.OS === 'web') {
                window.open(url, '_blank', 'noopener,noreferrer');
                return;
              }
              Linking.openURL(url).catch(() => {
                Alert.alert(
                  '다운로드 실패',
                  '파일을 열 수 없습니다. 잠시 후 다시 시도해주세요.',
                );
              });
            }}
            variant="secondary"
            fullWidth
            leftIcon="download-outline"
            style={styles.downloadBtn}
          >
            Word 파일 다운로드
          </Button>
        ) : null}

        {isOwner ? (
          <View style={styles.actions}>
            <Button
              onPress={() =>
                router.push(`/(tabs)/reports/${report.id}/edit` as never)
              }
              variant="secondary"
              fullWidth
              leftIcon="create-outline"
              style={styles.actionFlex}
            >
              수정
            </Button>
            <Button
              onPress={handleDelete}
              variant="ghost"
              fullWidth
              leftIcon="trash"
              style={styles.actionFlex}
            >
              삭제
            </Button>
          </View>
        ) : null}
      </BottomSheetScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  tripLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  meta: { marginTop: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  emptyFr: { paddingVertical: spacing.lg },
  frCard: { marginBottom: spacing.md },
  frHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  frHeadActions: { flexDirection: 'row', gap: spacing.xs },
  frTitle: { flex: 1 },
  frSlots: { flexDirection: 'row', gap: spacing.sm },
  frSlot: { flex: 1, alignItems: 'center' },
  frSlotLabel: { marginBottom: 4 },
  frPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  frPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  frCaption: { marginTop: 4 },
  downloadBtn: { marginTop: spacing.md },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  actionFlex: { flex: 1 },
});

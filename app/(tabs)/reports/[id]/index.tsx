import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { useAuthStore } from '@/stores/authStore';
import { toAbsoluteFileUrl } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import { captureOverviewMap } from '@/utils/captureView';
import { isFieldReportEmpty } from '@/utils/fieldReport';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle, useSheetBottomInset } from '@/components/MapSheetLayout';
import { KakaoMapWebView, fieldsToMarkers } from '@/components/KakaoMapWebView';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { EditableTitle } from '@/components/ui/EditableTitle';
import { OverflowButton } from '@/components/ui/NavHeader';
import { showActionSheet } from '@/components/ui/ActionSheet';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { BottomActionBar, useBottomActionBarHeight } from '@/components/ui/BottomActionBar';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDateTime, wasEdited } from '@/utils/datetime';
import type { Field, FieldReport } from '@/types/entities';

// 현장별 전·중·후 사진 카드 (명세 v2 FE-RPT-06·13).
// 카드에 수정·삭제 버튼을 두지 않는다(수락 기준 2) — 카드(›)를 누르면 그 현장의 보고서 수정으로 간다.
function FieldReportCard({
  fr,
  fieldName,
  onPress,
}: {
  fr: FieldReport;
  fieldName?: string;
  onPress?: () => void;
}) {
  const slots: Array<{ label: string; url?: string | null; caption?: string | null }> = [
    { label: '전', url: fr.beforePhotoUrl, caption: fr.beforePhotoCaption },
    { label: '중', url: fr.pendingPhotoUrl, caption: fr.pendingPhotoCaption },
    { label: '후', url: fr.afterPhotoUrl, caption: fr.afterPhotoCaption },
  ];
  const empty = isFieldReportEmpty(fr);
  return (
    <Card
      padding="md"
      style={styles.frCard}
      onPress={onPress}
      accessibilityLabel={`${fieldName ?? '현장 보고'}${empty ? ', 미작성' : ''}. 눌러서 수정`}
    >
      <View style={styles.frHead}>
        <Text variant="bodySm" weight="bold" style={styles.frTitle} numberOfLines={1}>
          {fieldName || fr.title || '현장 보고'}
        </Text>
        {empty ? <Badge label="미작성" tone="warning" size="sm" /> : null}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
      </View>
      <View style={styles.frSlots}>
        {slots.map((s) => (
          <View key={s.label} style={styles.frSlot}>
            <Text variant="caption" weight="bold" color="textMuted" style={styles.frSlotLabel}>
              {s.label}
            </Text>
            {s.url ? (
              <Image
                source={{ uri: toAbsoluteFileUrl(s.url) }}
                style={styles.frPhoto}
                resizeMode="cover"
                accessibilityLabel={s.caption ? `${s.label} 사진: ${s.caption}` : `${s.label} 사진`}
              />
            ) : (
              <View style={[styles.frPhoto, styles.frPhotoEmpty]}>
                <Text variant="caption" color="textMuted">
                  없음
                </Text>
              </View>
            )}
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
  const update = useReportStore((s) => s.update);
  const exportWord = useReportStore((s) => s.exportWord);
  const exportPdf = useReportStore((s) => s.exportPdf);
  const uploadOverviewPhoto = useReportStore((s) => s.uploadOverviewPhoto);
  const allTrips = useTripStore((s) => s.trips);
  const getField = useFieldStore((s) => s.getById);
  const allFields = useFieldStore((s) => s.fields);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const allVisits = useVisitStore((s) => s.visits);
  const userId = useAuthStore((s) => s.user?.id);

  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  // 위치도 캡처(§20) — 캡처 대상 View ref + 타일 페인트 완료 여부. tilesReady 전에는
  // 빈 지도를 찍지 않도록 캡처를 건너뛴다. web 은 captureOverviewMap 가 항상 null(taint).
  const overviewMapRef = useRef<View>(null);
  const [tilesReady, setTilesReady] = useState(false);
  const detailStatus = useReportStore((s) => s.detailStatus[reportId]);
  const barHeight = useBottomActionBarHeight();
  const bottomPad = useSheetBottomInset(barHeight);
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

  // fieldReports 안정 reference — 매 render `?? []` 새 array literal 회로 차단 (F9).
  const fieldReports = useMemo(() => report?.fieldReports ?? [], [report?.fieldReports]);
  const emptyCount = useMemo(() => fieldReports.filter(isFieldReportEmpty).length, [fieldReports]);

  const overviewFieldIds = useMemo(() => {
    const set = new Set<string>();
    fieldReports.forEach((fr) => fr.fieldId && set.add(fr.fieldId));
    if (set.size === 0 && trip) {
      for (const v of allVisits) {
        if (v.tripId === trip.id && v.fieldId) set.add(v.fieldId);
      }
    }
    return Array.from(set);
  }, [fieldReports, trip, allVisits]);

  const overviewMarkers = useMemo(() => {
    const byId = new Map(allFields.map((f) => [f.id, f]));
    const out: Field[] = [];
    for (const fid of overviewFieldIds) {
      const f = byId.get(fid);
      if (f) out.push(f);
    }
    return fieldsToMarkers(out);
  }, [allFields, overviewFieldIds]);

  useEffect(() => {
    for (const fid of overviewFieldIds) {
      if (useFieldStore.getState().getById(fid)) continue;
      void loadFieldDetail(fid);
    }
  }, [overviewFieldIds, loadFieldDetail]);

  if (!report) {
    return (
      <MapSheetLayout
        title="보고서 상세"
        onBack={() => safeBack(router)}
        initialIndex={1}
        mapFieldIds={overviewFieldIds}
      >
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
  const edited = wasEdited(report.createdAt, report.updatedAt);
  // 하단 바를 그리는 조건과 같아야 한다 — 바가 없는데 높이를 넘기면 시트 최저 높이가 빈 띠만큼 뜬다.
  const hasBottomBar = isOwner ? fieldReports.length > 0 : !!report.outputFileUrl?.trim();

  // 위치도 네이티브 캡처 → 업로드(§20) — best-effort. 문서 생성 직전에 찍어 최신 위치도 반영.
  const syncOverviewMap = async () => {
    if (overviewMarkers.length === 0 || !tilesReady) return;
    const file = await captureOverviewMap(overviewMapRef);
    if (file) await uploadOverviewPhoto(report.id, file);
  };

  // 생성된 파일 열기 — web 은 새 탭, 네이티브는 OS 공유·저장(외부 앱).
  const openFileUrl = (rawUrl: string) => {
    const url = toAbsoluteFileUrl(rawUrl);
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('다운로드 실패', '파일을 열 수 없습니다. 잠시 후 다시 시도해주세요.');
    });
  };

  // 내보내기는 매번 새로 만든다 — 만든 뒤 현장 보고를 고쳐도 서버가 outputFileUrl 을 비우지 않아
  // 예전 파일을 그대로 열면 수정 전 문서가 나간다(리뷰). 이미 파일이 있으면 regenerate 로 덮는다.
  const exportAsWord = async (explicitRegenerate: boolean) => {
    if (exporting) return;
    const regenerate = explicitRegenerate || !!report.outputFileUrl?.trim();
    setExporting(true);
    if (explicitRegenerate) toast('Word 파일을 다시 만들고 있어요');
    await syncOverviewMap();
    const r = await exportWord(report.id, regenerate);
    setExporting(false);
    if (!r.ok) {
      Alert.alert('Word 생성 실패', r.error);
      return;
    }
    const url = useReportStore.getState().detailCache[report.id]?.outputFileUrl?.trim();
    if (url && !explicitRegenerate) openFileUrl(url);
    else if (explicitRegenerate) toast('Word 파일을 다시 만들었어요');
  };

  // backend-backlog §19 — PDF 는 서버가 URL 을 영속하지 않는다 → 누를 때마다 생성 후 즉시 열기.
  const exportAsPdf = async () => {
    if (exporting) return;
    setExporting(true);
    await syncOverviewMap();
    const r = await exportPdf(report.id);
    setExporting(false);
    if (!r.ok) {
      Alert.alert('PDF 생성 실패', r.error);
      return;
    }
    openFileUrl(r.url);
  };

  // FE-RPT-14 — 미작성 현장이 있으면 먼저 묻는다. 동의하면 미작성 칸은 빈칸으로 나간다.
  const handleExport = async () => {
    if (emptyCount > 0) {
      const ok = await confirm({
        title: '미작성 현장이 있습니다',
        message: '정말 문서를 내보내시겠습니까?\n미작성 현장은 빈칸으로 내보내집니다.',
        confirmLabel: '내보내기',
      });
      if (!ok) return;
    }
    showActionSheet([
      { label: 'Word 파일 (.docx)', icon: 'document-text-outline', onPress: () => void exportAsWord(false) },
      { label: 'PDF 파일 (.pdf)', icon: 'document-outline', onPress: () => void exportAsPdf() },
    ]);
  };

  const handleDelete = async () => {
    const losses: string[] = [];
    if (fieldReports.length > 0) losses.push(`현장 보고 ${fieldReports.length}건`);
    if (report.outputFileUrl) losses.push('생성된 Word 파일');
    const ok = await confirm({
      title: '이 보고서를 삭제할까요?',
      message: losses.length > 0 ? `함께 사라지는 항목: ${losses.join(' · ')}` : undefined,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const r = await remove(report.id);
    if (r.ok || /이미 삭제|찾을 수 없는/.test(r.error ?? '')) {
      toast('보고서를 삭제했습니다');
      router.replace('/(tabs)/reports' as never);
      return;
    }
    setDeleting(false);
    Alert.alert('보고서 삭제 실패', r.error || '보고서를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.');
  };

  const openEdit = (frId: string) =>
    router.push(`/(tabs)/reports/${report.id}/field-report?frId=${frId}` as never);

  // `···` — 보고서 수정(첫 현장) / Word 다시 생성 / 보고서 삭제 (명세 §2.3).
  const openMore = () =>
    showActionSheet([
      ...(fieldReports.length > 0
        ? [{ label: '보고서 수정', icon: 'create-outline' as const, onPress: () => openEdit(fieldReports[0].id) }]
        : []),
      ...(fieldReports.length > 0
        ? [{ label: 'Word 다시 생성', icon: 'refresh' as const, onPress: () => void exportAsWord(true) }]
        : []),
      { label: '보고서 삭제', icon: 'trash-outline', tone: 'danger', onPress: () => void handleDelete() },
    ]);

  // FE-RPT-08a — 제목은 상세 상단에서 바로 고친다.
  const saveTitle = async (title: string) => {
    const r = await update(report.id, { title });
    if (!r.ok) {
      Alert.alert('제목 저장 실패', r.error);
      throw new Error(r.error);
    }
  };

  return (
    <View style={styles.root}>
      <MapSheetLayout bottomBarHeight={hasBottomBar ? barHeight : 0}
        title="보고서 상세"
        onBack={() => safeBack(router)}
        initialIndex={1}
        mapFieldIds={overviewFieldIds}
        headerRight={isOwner ? <OverflowButton onPress={openMore} label="보고서 상세 더보기" /> : undefined}
      >
        <BottomSheetScrollView
          style={sheetScrollableStyle}
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        >
          {isOwner ? (
            <EditableTitle value={report.title} onSubmit={saveTitle} maxLength={100} label="보고서 제목" />
          ) : (
            <Text variant="h2">{report.title}</Text>
          )}

          {trip ? (
            <Pressable
              onPress={() => router.push(`/(tabs)/trips/${trip.id}` as never)}
              style={({ pressed }) => [styles.tripLink, pressed && { opacity: opacity.pressed }]}
            >
              <Ionicons name="briefcase-outline" size={14} color={colors.primary} />
              <Text variant="bodySm" weight="semibold" color="primary" numberOfLines={1} style={styles.tripText}>
                연결 외근: {trip.title ? `${trip.title} · ` : ''}
                {fmtDateTime(trip.startedAt)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          ) : null}

          <Text variant="caption" color="textMuted" style={styles.meta}>
            작성: {fmtDateTime(report.createdAt)}
            {edited ? ` · 수정: ${fmtDateTime(report.updatedAt)}` : ''}
          </Text>

          {/* 위치도 — 그 외근의 현장 전체를 담는 정적 지도(figure). 시트 pan 과 충돌하지 않게 조작 비활성. */}
          {overviewMarkers.length > 0 ? (
            <>
              <Text variant="bodySm" weight="bold" color="textMuted" style={styles.mapLabel}>
                위치도 — 현장 {overviewMarkers.length}곳
              </Text>
              <View ref={overviewMapRef} collapsable={false} style={styles.overviewMap}>
                <KakaoMapWebView
                  markers={overviewMarkers}
                  fitToMarkers
                  interactive={false}
                  onTilesLoaded={() => setTilesReady(true)}
                />
              </View>
            </>
          ) : null}

          <View style={styles.sectionHead}>
            <View style={styles.sectionTitle}>
              <Text variant="bodySm" weight="bold" color="textMuted">
                현장별 전·중·후
              </Text>
              {emptyCount > 0 ? <Badge label={`미작성 ${emptyCount}곳`} tone="warning" size="sm" /> : null}
            </View>
            {isOwner ? (
              <Button
                onPress={() => router.push(`/(tabs)/reports/${report.id}/field-report` as never)}
                variant="secondary"
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
                onPress={isOwner ? () => openEdit(fr.id) : undefined}
              />
            ))
          )}
        </BottomSheetScrollView>
      </MapSheetLayout>
      {/* 하단 바는 시트 밖 — gorhom pan 이 시트 안 버튼의 터치를 가로챈다. */}
      {isOwner && fieldReports.length > 0 ? (
        <BottomActionBar absolute>
          <Button
            onPress={() => void handleExport()}
            loading={exporting}
            size="lg"
            fullWidth
            leftIcon="download-outline"
          >
            내보내기
          </Button>
        </BottomActionBar>
      ) : !isOwner && report.outputFileUrl?.trim() ? (
        // 작성자가 아니면 만들 수는 없지만 이미 만들어진 Word 는 받을 수 있어야 한다.
        <BottomActionBar absolute>
          <Button
            onPress={() => openFileUrl(report.outputFileUrl!.trim())}
            size="lg"
            fullWidth
            leftIcon="download-outline"
          >
            Word 파일 다운로드
          </Button>
        </BottomActionBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // paddingBottom 은 렌더에서 — 55% 시트 + 하단 바(useSheetBottomInset 주석).
  scroll: { padding: spacing.lg },
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
    maxWidth: '100%',
  },
  tripText: { flexShrink: 1 },
  meta: { marginTop: spacing.sm },
  mapLabel: { marginTop: spacing.lg, marginBottom: spacing.xs },
  overviewMap: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  emptyFr: { paddingVertical: spacing.lg },
  frCard: { marginBottom: spacing.md },
  frHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  frTitle: { flex: 1 },
  frSlots: { flexDirection: 'row', gap: spacing.sm },
  frSlot: { flex: 1, alignItems: 'center' },
  frSlotLabel: { marginBottom: spacing.xs },
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
});

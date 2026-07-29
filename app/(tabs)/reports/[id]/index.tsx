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
import { useVisitStore } from '@/stores/visitStore';
import { useAuthStore } from '@/stores/authStore';
import { toAbsoluteFileUrl } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import { captureOverviewMap } from '@/utils/captureView';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { KakaoMapWebView, fieldsToMarkers } from '@/components/KakaoMapWebView';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDateTime } from '@/utils/datetime';
import type { Field, FieldReport } from '@/types/entities';

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
  const resolve = toAbsoluteFileUrl;
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
              <Button onPress={onDelete} variant="dangerGhost" size="sm" leftIcon="trash">
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
                accessibilityLabel={
                  s.caption ? `${s.label} 사진: ${s.caption}` : `${s.label} 사진`
                }
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
  const exportWord = useReportStore((s) => s.exportWord);
  const exportPdf = useReportStore((s) => s.exportPdf);
  const uploadOverviewPhoto = useReportStore((s) => s.uploadOverviewPhoto);
  const removeFieldReport = useReportStore((s) => s.removeFieldReport);
  const allTrips = useTripStore((s) => s.trips);
  const getField = useFieldStore((s) => s.getById);
  const allFields = useFieldStore((s) => s.fields);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const allVisits = useVisitStore((s) => s.visits);
  const userId = useAuthStore((s) => s.user?.id);

  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  // 위치도 캡처(§20) — 캡처 대상 View ref + 타일 페인트 완료 여부. tilesReady 전에는
  // 빈 지도를 찍지 않도록 캡처를 건너뛴다. web 은 captureOverviewMap 가 항상 null(taint).
  const overviewMapRef = useRef<View>(null);
  const [tilesReady, setTilesReady] = useState(false);
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

  // fieldReports 안정 reference — 매 render `?? []` 새 array literal 회로 차단 (F9).
  // 모든 useMemo/effect 는 early return 전에 호출해 Rules of Hooks 준수 (F1).
  const fieldReports = useMemo(
    () => report?.fieldReports ?? [],
    [report?.fieldReports],
  );

  // '현장 전반 위치도' (결정 §5) 는 배경 MapSheetLayout 의 MapDashboard 로 위임 (F7).
  // 별도 inner WebView 제거 — 이중 지도 + BottomSheet pan 가로채기 회로 차단.
  // overviewFieldIds 만 계산해 mapFieldIds prop 으로 전달. centroid 는 MapDashboard 가 자체 계산.
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

  // 위치도 마커 — overviewFieldIds 의 현장 객체(좌표)를 fieldStore 에서 lookup.
  const overviewMarkers = useMemo(() => {
    const byId = new Map(allFields.map((f) => [f.id, f]));
    const out: Field[] = [];
    for (const fid of overviewFieldIds) {
      const f = byId.get(fid);
      if (f) out.push(f);
    }
    return fieldsToMarkers(out);
  }, [allFields, overviewFieldIds]);

  // 위치도용 현장 좌표 확보 — 아직 fieldStore 에 없는 fieldId 만 detail 로드.
  // overviewFieldIds/loadFieldDetail 에만 의존(allFields 제외) → 로드가 재발화를 유발하지 않음.
  useEffect(() => {
    for (const fid of overviewFieldIds) {
      if (useFieldStore.getState().getById(fid)) continue;
      void loadFieldDetail(fid);
    }
  }, [overviewFieldIds, loadFieldDetail]);

  if (!report) {
    // 첫 진입 race 동안 LoadingState 노출, fetch 끝났는데도 null 이면 'not found'.
    // initialIndex/mapFieldIds 를 loaded 분기와 동일하게 — prop 변경으로 시트가 92%→55% 점프
    // 하거나 배경 지도가 '전체 현장 flash → scope' 으로 깜빡이던 회로 차단 (G1·G5).
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
  const hasOutput = !!(report.outputFileUrl && report.outputFileUrl.trim());

  // 위치도 네이티브 캡처 → 업로드(§20) — best-effort. 문서 생성 직전에 찍어 최신 위치도 반영.
  // 캡처/업로드 실패(안드 WebView 빈칸·네트워크 등)는 throw 하지 않고 위치도 없이 진행.
  // web 은 captureOverviewMap 가 null 반환(taint) → 자연 skip. 타일 미로드 시도 skip.
  // Word·PDF 양쪽이 같은 위치도를 쓰므로 공통 함수로 둔다.
  const syncOverviewMap = async () => {
    if (overviewMarkers.length === 0 || !tilesReady) return;
    const file = await captureOverviewMap(overviewMapRef);
    if (file) await uploadOverviewPhoto(report.id, file);
  };

  // 생성된 파일 열기 — web 은 새 탭, 네이티브는 외부 앱. 실패가 silent 로 끝나지 않게 alert.
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

  const handleExport = async (regenerate: boolean) => {
    if (exporting) return;
    setExporting(true);
    await syncOverviewMap();
    const r = await exportWord(report.id, regenerate);
    setExporting(false);
    // web 은 webAlertPatch 가 window.alert 로 라우팅 — 분기 불필요.
    if (!r.ok) Alert.alert('Word 생성 실패', r.error);
  };

  // backend-backlog §19 — PDF 는 서버가 URL 을 영속하지 않는다(보고서에 pdf 컬럼 없음).
  // 그래서 Word 처럼 '다운로드 버튼 상시 노출' 이 불가능하고, 누를 때마다 생성→즉시 열기 단발로 간다.
  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    await syncOverviewMap();
    const r = await exportPdf(report.id);
    setExportingPdf(false);
    if (!r.ok) {
      Alert.alert('PDF 생성 실패', r.error);
      return;
    }
    openFileUrl(r.url);
  };

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
    // 함께 사라지는 항목 안내 — 사용자가 결정 전에 무엇이 함께 삭제되는지 미리 확인.
    const losses: string[] = [];
    if (fieldReports.length > 0) {
      losses.push(`현장 보고 ${fieldReports.length}건`);
    }
    if (report.outputFileUrl) losses.push('생성된 Word 파일');
    const lossesNote = losses.length > 0 ? `\n\n함께 사라지는 항목: ${losses.join(' · ')}` : '';
    const msg = `이 보고서를 정말 삭제할까요?${lossesNote}`;
    if (Platform.OS === 'web') {
      if (confirm(msg)) void doDelete();
    } else {
      Alert.alert('보고서 삭제', msg, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  };

  return (
    <MapSheetLayout
      title="보고서 상세"
      onBack={() => safeBack(router)}
      initialIndex={1}
      mapFieldIds={overviewFieldIds}
    >
      <BottomSheetScrollView style={sheetScrollableStyle} contentContainerStyle={styles.scroll}>
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
              연결 외근: {trip.title ? `${trip.title} · ` : ''}
              {fmtDateTime(trip.startedAt)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        ) : null}

        <Text variant="caption" color="textMuted" style={styles.meta}>
          작성: {fmtDateTime(report.createdAt)}
          {report.updatedAt ? ` · 수정: ${fmtDateTime(report.updatedAt)}` : ''}
        </Text>

        {/* 위치도 — 그 외근의 현장 전체를 담는 정적 지도(figure). BottomSheet 안이라 드래그/줌
            비활성(interactive=false)으로 sheet pan 과 충돌 회피. 전체 탐색은 배경 지도로 위임. */}
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

        {/* Word 영역 — 주 행동(다운로드 또는 생성)만 primary 로 강조, '다시 생성'은 보조(ghost·축소).
            현장 보고가 없으면 서버가 report_no_photos 로 거절하므로 생성 버튼은 숨김. */}
        {hasOutput ? (
          <>
            <Button
              onPress={() => openFileUrl(report.outputFileUrl!.trim())}
              variant="primary"
              fullWidth
              leftIcon="download-outline"
              style={styles.downloadBtn}
            >
              Word 파일 다운로드
            </Button>
            {isOwner && fieldReports.length > 0 ? (
              <Button
                onPress={() => void handleExport(true)}
                loading={exporting}
                variant="ghost"
                size="sm"
                leftIcon="refresh"
                style={styles.regenBtn}
              >
                Word 다시 생성
              </Button>
            ) : null}
          </>
        ) : isOwner && fieldReports.length > 0 ? (
          <Button
            onPress={() => void handleExport(false)}
            loading={exporting}
            variant="primary"
            fullWidth
            leftIcon="document-text-outline"
            style={styles.downloadBtn}
          >
            Word 생성
          </Button>
        ) : null}

        {/* PDF(§19) — 결과 URL 이 서버에 남지 않아 '생성 후 즉시 열기' 단발. 그래서 Word 처럼
            '다운로드 / 다시 생성' 2단 구성이 성립하지 않고 버튼 하나로 끝난다.
            노출 조건은 Word '생성' 과 동일 — 현장 보고가 없으면 서버가 400 으로 거절. */}
        {isOwner && fieldReports.length > 0 ? (
          <Button
            onPress={() => void handleExportPdf()}
            loading={exportingPdf}
            variant="secondary"
            fullWidth
            leftIcon="document-outline"
            style={styles.pdfBtn}
          >
            PDF 내보내기
          </Button>
        ) : null}

        {isOwner ? (
          <View
            style={[
              styles.actions,
              // Word 영역(다운로드/생성)이 위에 있을 때만 구분선 — '허공 구분선' 방지.
              (hasOutput || fieldReports.length > 0) && styles.actionsDivider,
            ]}
          >
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
              variant="dangerGhost"
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
  mapLabel: { marginTop: spacing.lg, marginBottom: spacing.xs },
  overviewMap: {
    height: 300,
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
  frCaption: { marginTop: spacing.xs },
  downloadBtn: { marginTop: spacing.md },
  // '다시 생성'은 보조 — 폭을 줄여(self) 다운로드 primary 보다 약하게.
  regenBtn: { alignSelf: 'center', marginTop: spacing.xs },
  // PDF 는 Word 영역과 같은 '문서 내보내기' 묶음 — downloadBtn 과 같은 간격으로 이어 붙인다.
  pdfBtn: { marginTop: spacing.sm },
  // 보고서 관리(수정/삭제) 그룹.
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  // Word 영역과 구분선으로 분리 — Word 버튼이 위에 있을 때만 적용.
  actionsDivider: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  actionFlex: { flex: 1 },
});

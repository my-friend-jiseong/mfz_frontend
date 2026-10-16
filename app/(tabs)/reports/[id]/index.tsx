import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAbsoluteFileUrl } from '@/api';
import { Icon, type IconName } from '@/components/icons';
import {
  OrderBadge,
  ReportOverviewMap,
  SLOTS,
  SLOT_CAPTION,
  SLOT_URL,
  fieldName,
  useReportRows,
  type ReportRow,
} from '@/components/reports/ReportParts';
import { goToTabRoot } from '@/components/shell/tabNav';
import { AppSheet } from '@/components/ui/AppSheet';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { showPopoverMenu } from '@/components/ui/PopoverMenu';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { Touchable } from '@/components/ui/Touchable';
import { useAuthStore } from '@/stores/authStore';
import { useReportCompletionStore } from '@/stores/reportCompletionStore';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { safeBack } from '@/utils/backNavigation';
import { captureOverviewMap } from '@/utils/captureView';
import { fmtMonthDay, fmtTime } from '@/utils/datetime';
import { isFieldReportEmpty } from '@/utils/fieldReport';
import { useOverviewMapView } from '@/utils/overviewMapView';
import { reportEditHref } from '@/utils/reportEntry';
import { reportFileName, saveReportFile, shareReportFile, type ReportFileFormat } from '@/utils/reportFile';
import { tripTitle } from '@/utils/tripFormat';
import { c2, radius2, space } from '@/theme/v2';

type FileAction = 'share' | 'save';

// 9-5·9-15 형식 줄. HWPX 는 서버에 만드는 API 가 없어 숨긴다(백로그 '2차 개편 요청' I).
const FORMATS: { key: ReportFileFormat; badge: string; color: string; title: string; sub: string }[] = [
  { key: 'docx', badge: 'DOCX', color: c2.file.docx, title: '워드 문서', sub: 'DOCX · MS Word에서 편집' },
  { key: 'pdf', badge: 'PDF', color: c2.file.pdf, title: 'PDF', sub: '편집 없이 보기·인쇄' },
];

/**
 * 9-3 보고서 상세(Figma 542:2329). 탭 스택 푸시(탭 바 유지).
 * ⋯ → 9-4 [공유](9-5) [내려받기](9-15). 하단 [수정](→ 9-6) [삭제](→ 9-13).
 * 공유·내려받기는 누를 때마다 지금 내용으로 새로 만든다('다시 만들기' 없음, 인수인계 9-4).
 */
export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);

  const report = useReportStore((s) => s.detailCache[reportId] ?? s.reports.find((r) => r.id === reportId));
  const detailStatus = useReportStore((s) => s.detailStatus[reportId]);
  useEffect(() => {
    if (reportId) void useReportStore.getState().loadDetail(reportId);
  }, [reportId]);
  const trip = useTripStore((s) => (report?.tripId ? s.trips.find((t) => t.id === report.tripId) : undefined));
  useEffect(() => {
    if (report?.tripId && !useTripStore.getState().trips.some((t) => t.id === report.tripId)) {
      void useTripStore.getState().loadDetail(report.tripId);
    }
  }, [report?.tripId]);

  const { rows, markers } = useReportRows(report?.fieldReports);
  const view = useOverviewMapView(reportId);

  // 위치도 캡처(백로그 §20) — 문서를 만들기 직전에 이 카드를 찍어 올린다. 타일이 그려지기 전엔 찍지 않는다. 웹은 못 찍는다.
  const mapRef = useRef<View>(null);
  const [tilesReady, setTilesReady] = useState(false);
  const moreRef = useRef<View>(null);
  // 시트가 내려가는 동안에도 제목이 바뀌지 않게 종류는 따로 둔다.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheetKind] = useState<FileAction>('share');
  const openSheet = (k: FileAction) => {
    setSheetKind(k);
    setSheetOpen(true);
  };
  const [busy, setBusy] = useState<ReportFileFormat | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!report && (!report.creatorId || report.creatorId === userId);
  const editedTitle = report?.title ?? '';

  const sheetSubtitle = useMemo(() => {
    const parts = [editedTitle, `현장 ${rows.length}곳`];
    if (markers.length > 0) parts.push('위치도 포함');
    return parts.join(' · ');
  }, [editedTitle, rows.length, markers.length]);

  if (!report) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => safeBack(router)} />
        <View style={styles.center}>
          {detailStatus === 'missing' ? (
            <>
              <Text v2="bodyL.bold">보고서를 찾을 수 없어요</Text>
              <Text v2="bodyS.regular" tone="tertiary">
                삭제됐거나 다른 사람의 보고서일 수 있어요.
              </Text>
            </>
          ) : (
            <ActivityIndicator color={c2.text.tertiary} />
          )}
        </View>
      </View>
    );
  }

  const syncOverviewMap = async () => {
    if (Platform.OS === 'web' || markers.length === 0 || !tilesReady) return;
    const file = await captureOverviewMap(mapRef);
    if (file) await useReportStore.getState().uploadOverviewPhoto(report.id, file);
  };

  const runFile = async (format: ReportFileFormat, action: FileAction) => {
    if (busy) return;
    setBusy(format);
    await syncOverviewMap();
    let url: string | undefined;
    if (format === 'docx') {
      const r = await useReportStore.getState().exportWord(report.id, true);
      if (!r.ok) {
        setBusy(null);
        await notice('파일을 만들지 못했어요', r.error);
        return;
      }
      url = useReportStore.getState().detailCache[report.id]?.outputFileUrl?.trim() || undefined;
    } else {
      const r = await useReportStore.getState().exportPdf(report.id);
      if (!r.ok) {
        setBusy(null);
        await notice('파일을 만들지 못했어요', r.error);
        return;
      }
      url = r.url;
    }
    const abs = url ? toAbsoluteFileUrl(url) : null;
    if (!abs) {
      setBusy(null);
      await notice('파일을 만들지 못했어요', '파일 주소를 받지 못했어요. 잠시 뒤 다시 해 주세요.');
      return;
    }
    const name = reportFileName(report.title, format);
    const res = action === 'share' ? await shareReportFile(abs, name, format) : await saveReportFile(abs, name, format);
    setBusy(null);
    if (res.ok) {
      setSheetOpen(false);
      if (action === 'save' && Platform.OS === 'android') toast('휴대폰에 저장했어요');
      return;
    }
    if (!res.cancelled) await notice(action === 'share' ? '공유하지 못했어요' : '내려받지 못했어요', res.error);
  };

  const openMore = () =>
    showPopoverMenu(
      moreRef.current,
      [
        { label: '공유', icon: 'share', onPress: () => openSheet('share') },
        { label: '내려받기', icon: 'download', onPress: () => openSheet('save') },
      ],
      { width: 216 },
    );

  const remove = async () => {
    const ok = await confirm({
      title: '보고서를 삭제할까요?',
      message: '외근 기록은 그대로 남아요.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const r = await useReportStore.getState().remove(report.id);
    if (!r.ok && !/이미 삭제|찾을 수 없/.test(r.error)) {
      setDeleting(false);
      await notice('보고서를 삭제하지 못했어요', r.error);
      return;
    }
    useReportCompletionStore.getState().forget(report.id);
    // 스택을 첫 화면(9)으로 되돌린다.
    goToTabRoot('reports');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header onBack={() => safeBack(router)} onMore={isOwner ? openMore : undefined} moreRef={moreRef} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        <Text v2="title.l" accessibilityRole="header">
          {report.title}
        </Text>
        {trip ? (
          <Touchable
            onPress={() => router.push(`/(tabs)/trips/${trip.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`외근 ${tripTitle(trip)} 보기`}
            style={styles.tripLink}
          >
            <Icon name="briefcase-simple" size={16} color={c2.text.link} />
            <Text v2="bodyS.semibold" tone="link" numberOfLines={1} style={styles.shrink}>
              {`${tripTitle(trip)} · ${fmtMonthDay(trip.startedAt)} 외근`}
            </Text>
            <Icon name="chevron-right" size={14} color={c2.text.link} />
          </Touchable>
        ) : null}
        <Text v2="caption.regular" tone="tertiary" style={styles.written}>
          {`작성 ${fmtMonthDay(report.createdAt)} ${fmtTime(report.createdAt)}`}
        </Text>

        {markers.length > 0 ? (
          <>
            <View ref={mapRef} collapsable={false} style={styles.map}>
              <ReportOverviewMap markers={markers} view={view} onTilesLoaded={() => setTilesReady(true)} />
            </View>
            <Text v2="caption.regular" tone="tertiary" style={styles.mapCaption}>
              {`위치도 · 현장 ${markers.length}곳 (문서 첫 장에 들어가요)`}
            </Text>
          </>
        ) : null}

        <View style={styles.sections}>
          {rows.map((r) => (
            <FieldSection key={r.fr.id} row={r} />
          ))}
        </View>
      </ScrollView>

      {isOwner ? (
        <BottomActionBar safeArea={false} style={styles.footer}>
          <View style={styles.footerRow}>
            <Button2 onPress={() => router.push(reportEditHref(report.id, 'edit') as never)} style={styles.flex}>
              수정
            </Button2>
            <Button2 variant="danger" onPress={() => void remove()} loading={deleting}>
              삭제
            </Button2>
          </View>
        </BottomActionBar>
      ) : null}

      <AppSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheet === 'save' ? '내려받기' : '공유'}
        subtitle={`${sheetSubtitle}\n${sheet === 'save' ? '형식을 고르면 휴대폰에 저장돼요' : '형식을 고르면 폰의 공유 창이 열려요'}`}
      >
        <View style={styles.sheetList}>
          {FORMATS.map((f, i) => (
            <FormatRow
              key={f.key}
              format={f}
              icon={sheet === 'save' ? 'download' : 'share'}
              actionLabel={sheet === 'save' ? '내려받기' : '공유'}
              busy={busy === f.key}
              disabled={busy !== null}
              divider={i > 0}
              onPress={() => void runFile(f.key, sheet)}
            />
          ))}
        </View>
      </AppSheet>
    </View>
  );
}

function Header({ onBack, onMore, moreRef }: { onBack: () => void; onMore?: () => void; moreRef?: React.RefObject<View | null> }) {
  return (
    <View style={styles.header}>
      <Touchable onPress={onBack} accessibilityRole="button" accessibilityLabel="보고서 목록으로" style={styles.headerBtn}>
        <Icon name="arrow-left" size={24} color={c2.text.primary} />
      </Touchable>
      {onMore ? (
        <Touchable ref={moreRef} onPress={onMore} accessibilityRole="button" accessibilityLabel="더보기" style={styles.headerBtn}>
          <Icon name="more" size={24} color={c2.text.primary} />
        </Touchable>
      ) : null}
    </View>
  );
}

/** 9-3 현장 한 묶음: 순번·이름 + 채운 전·중·후 사진(설명은 사진 아래). */
function FieldSection({ row }: { row: ReportRow }) {
  const tiles = SLOTS.filter((s) => row.fr[SLOT_URL[s.key]] || row.fr[SLOT_CAPTION[s.key]]?.trim());
  const empty = isFieldReportEmpty(row.fr);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <OrderBadge n={row.order} kind={row.kind} />
        <Text v2="bodyL.bold" numberOfLines={1} style={styles.shrink}>
          {fieldName(row.field)}
        </Text>
      </View>
      {empty ? (
        <Text v2="caption.semibold" tone="warning" style={styles.emptySection}>
          작성 전
        </Text>
      ) : (
        <View style={styles.tiles}>
          {[0, 1, 2].map((i) => {
            const s = tiles[i];
            if (!s) return <View key={`gap-${i}`} style={styles.tile} />;
            const url = toAbsoluteFileUrl(row.fr[SLOT_URL[s.key]]);
            const caption = row.fr[SLOT_CAPTION[s.key]]?.trim();
            return (
              <View key={s.key} style={styles.tile}>
                <View style={styles.photo}>
                  {url ? (
                    <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`${s.label} 사진`} />
                  ) : null}
                  <View style={styles.photoTag}>
                    <Text v2="micro.bold" tone="inverse">
                      {s.short}
                    </Text>
                  </View>
                </View>
                {caption ? (
                  <Text v2="small.regular" tone="secondary" style={styles.photoCaption}>
                    {caption}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function FormatRow({
  format,
  icon,
  actionLabel,
  busy,
  disabled,
  divider,
  onPress,
}: {
  format: (typeof FORMATS)[number];
  icon: IconName;
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${format.title} ${actionLabel}`}
      accessibilityState={{ busy, disabled }}
      noAutoHitSlop
      style={[styles.formatRow, divider && styles.divider]}
    >
      <View style={[styles.badge, { backgroundColor: format.color }]}>
        <Text v2="small.extrabold" tone="inverse">
          {format.badge}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text v2="bodyL.bold">{format.title}</Text>
        <Text v2="caption.regular" tone="tertiary">
          {format.sub}
        </Text>
      </View>
      <View style={styles.actionCircle}>
        {busy ? <ActivityIndicator size="small" color={c2.text.link} /> : <Icon name={icon} size={22} color={c2.text.link} />}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[6] },
  header: {
    height: 48,
    paddingTop: space[4],
    paddingHorizontal: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: { width: 44, height: 44, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: space[20], paddingTop: space[4], paddingBottom: space[24] },
  tripLink: { flexDirection: 'row', alignItems: 'center', gap: space[4], alignSelf: 'flex-start', minHeight: 24, marginTop: space[4] },
  written: { marginTop: space[2] },
  map: { marginTop: space[16] },
  mapCaption: { marginTop: space[6] },
  sections: { marginTop: space[16] },
  section: { borderTopWidth: 1, borderTopColor: c2.border.subtle, paddingTop: space[16], paddingBottom: space[16] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space[10] },
  emptySection: { marginTop: space[10] },
  tiles: { flexDirection: 'row', gap: space[8], marginTop: space[10] },
  tile: { flex: 1 },
  photo: { aspectRatio: 1, borderRadius: radius2.md, overflow: 'hidden', backgroundColor: c2.bg.placeholder },
  photoTag: {
    position: 'absolute',
    top: space[6],
    left: space[6],
    height: 18,
    paddingHorizontal: space[6],
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: c2.bg.hint,
  },
  photoCaption: { marginTop: space[6] },
  footer: { paddingTop: space[12], borderTopColor: c2.border.default },
  footerRow: { flexDirection: 'row', gap: space[8] },
  sheetList: { paddingHorizontal: space[20], paddingTop: space[6] },
  formatRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  badge: { width: 44, height: 44, borderRadius: radius2.md, alignItems: 'center', justifyContent: 'center' },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

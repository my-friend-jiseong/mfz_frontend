import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import {
  OrderBadge,
  ReportOverviewMap,
  SlotMiniBoxes,
  fieldName,
  fieldReportCounts,
  useReportRows,
  type ReportRow,
} from '@/components/reports/ReportParts';
import { ReportModalHeader } from '@/components/reports/ReportModalHeader';
import { AppSheet } from '@/components/ui/AppSheet';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { confirm } from '@/components/ui/ConfirmDialog';
import { FieldMessage, TextField2 } from '@/components/ui/FormField2';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useFieldStore } from '@/stores/fieldStore';
import { useReportCompletionStore } from '@/stores/reportCompletionStore';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { districtOf } from '@/utils/addressFormat';
import { safeBack } from '@/utils/backNavigation';
import { fmtMonthDay } from '@/utils/datetime';
import { isFieldReportEmpty } from '@/utils/fieldReport';
import { withTopicJosa } from '@/utils/josa';
import { useOverviewMapView } from '@/utils/overviewMapView';
import { reportDetailHref } from '@/utils/reportEntry';
import { useReportDuration } from '@/utils/useReportDuration';
import { c2, radius2, space } from '@/theme/v2';

const TITLE_MAX = 100;

/** 9-10 현장 추가 후보 한 줄. visitId 가 있으면 이 외근의 방문(9-11 은 그 방문의 사진·메모를 보여 준다). */
interface Candidate {
  fieldId: string;
  visitId?: string;
  visitedAt: string | null;
}

/**
 * 9-2 보고서 작성 · 9-6 보고서 수정(Figma 711:3421 · 714:3425). 한 화면이고 mode 만 다르다.
 * 보고서는 연 때 이미 있다(외근 상세 [보고서 작성]이 만든다, reportEntry). 여기선 제목·위치도 구도·현장 목록을 고친다.
 * 현장 보고(9-8)·추가(9-11)·빼기(9-9)는 각 화면이 바로 서버에 반영하고, 이 화면의 [저장]은 제목과 '작성 완료'를 정한다.
 * - 작성 모드 닫기(X) = 나중에 작성하기: 고친 제목은 남기고 닫는다(작성 중으로 남음, 3-1).
 * - 수정 모드 닫기(X) = 수정 취소: 제목 변경을 버린다.
 * - [저장]: 작성 전 현장이 있으면 9-12 확인. 저장하면 빈 현장은 빈 채로 작성 완료(reportCompletionStore).
 */
export default function ReportEditScreen() {
  const { id, mode: modeParam } = useLocalSearchParams<{ id: string; mode?: string }>();
  const reportId = id ?? '';
  const mode: 'create' | 'edit' = modeParam === 'edit' ? 'edit' : 'create';
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const recordDuration = useReportDuration();

  const report = useReportStore((s) => s.detailCache[reportId]);
  const detailStatus = useReportStore((s) => s.detailStatus[reportId]);
  useEffect(() => {
    if (reportId && !useReportStore.getState().detailCache[reportId]?.fieldReports) void useReportStore.getState().loadDetail(reportId);
  }, [reportId]);

  const { rows, markers } = useReportRows(report?.fieldReports);
  const view = useOverviewMapView(reportId);

  // 제목 — 보고서가 처음 도착했을 때 한 번 채운다.
  const [title, setTitle] = useState('');
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !report) return;
    hydrated.current = true;
    setTitle(report.title);
  }, [report]);
  const titleRef = useRef(title);
  titleRef.current = title;

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // 작성 모드에서 닫을 때(X·안드로이드 뒤로) 고친 제목은 남긴다 — 나중에 이어서 쓸 때 그대로 보이게.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (mode !== 'create' || savingRef.current) return;
        const next = titleRef.current.trim();
        const cur = useReportStore.getState().detailCache[reportId]?.title;
        if (next && cur !== undefined && next !== cur) void useReportStore.getState().update(reportId, { title: next });
      }),
    [navigation, mode, reportId],
  );

  // === 9-10 현장 추가 ===
  const [sheetOpen, setSheetOpen] = useState(false);
  const picked = useRef<Candidate | null>(null);
  const tripId = report?.tripId ?? null;
  const tripVisits = useVisitStore((s) => s.visits);
  const fields = useFieldStore((s) => s.fields);
  useEffect(() => {
    // 외근 방문을 아직 안 받았으면(목록에서 바로 연 경우) 받아 둔다 — 9-10 후보의 첫 묶음.
    if (tripId && useVisitStore.getState().byTrip(tripId).length === 0) void useTripStore.getState().loadDetail(tripId);
  }, [tripId]);
  const candidates = useMemo(() => {
    const inReport = new Set(rows.map((r) => r.fr.fieldId));
    const visits = tripId
      ? tripVisits.filter((v) => v.tripId === tripId && v.fieldId).sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
      : [];
    const tripFieldIds: string[] = [];
    for (const v of visits) if (!tripFieldIds.includes(v.fieldId)) tripFieldIds.push(v.fieldId);
    const fromTrip: Candidate[] = tripFieldIds
      .filter((fid) => !inReport.has(fid))
      .map((fid) => {
        const last = visits.filter((v) => v.fieldId === fid).pop()!;
        return { fieldId: fid, visitId: last.id, visitedAt: last.visitedAt };
      });
    const taken = new Set([...inReport, ...tripFieldIds]);
    const others: Candidate[] = fields
      .filter((f) => !taken.has(f.id) && f.recentVisitedAt)
      .sort((a, b) => (b.recentVisitedAt ?? '').localeCompare(a.recentVisitedAt ?? ''))
      .slice(0, 10)
      .map((f) => ({ fieldId: f.id, visitedAt: f.recentVisitedAt ?? null }));
    return { list: [...fromTrip, ...others], fromTrip: fromTrip.length, tripFieldCount: tripFieldIds.length };
  }, [rows, tripId, tripVisits, fields]);
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);

  const sheetSubtitle =
    candidates.fromTrip > 0
      ? '이 외근에서 방문했지만 보고서에 없는 현장부터 보여요.'
      : candidates.tripFieldCount > 0
        ? `이 외근의 현장 ${candidates.tripFieldCount}곳은 모두 들어 있어요. 최근에 방문한 다른 현장을 골라요.`
        : '최근에 방문한 현장을 골라요.';

  const onSheetClose = useCallback(() => {
    setSheetOpen(false);
    const c = picked.current;
    picked.current = null;
    if (!c) return;
    // 시트가 다 내려간 뒤에 연다(같은 틱에 시트 상태와 화면 이동을 겹치지 않게).
    router.push({
      pathname: '/field-report',
      params: { reportId, fieldId: c.fieldId, ...(c.visitId ? { visitId: c.visitId } : {}) },
    } as never);
  }, [router, reportId]);

  if (!report) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ReportModalHeader title={mode === 'create' ? '보고서 작성' : '보고서 수정'} onClose={() => safeBack(router)} />
        <View style={styles.missing}>
          <Text v2="bodyM.regular" tone="tertiary">
            {detailStatus === 'missing' ? '보고서를 찾을 수 없어요.' : '보고서를 불러오고 있어요.'}
          </Text>
        </View>
      </View>
    );
  }

  const openRow = (r: ReportRow) =>
    router.push({ pathname: '/field-report', params: { reportId, frId: r.fr.id } } as never);

  const save = async () => {
    if (savingRef.current) return;
    const t = title.trim();
    if (!t) {
      setError('제목을 입력해 주세요.');
      return;
    }
    const empties = rows.filter((r) => isFieldReportEmpty(r.fr));
    if (empties.length > 0) {
      const first = fieldName(empties[0].field);
      const ok = await confirm({
        title: `${empties.length}곳이 아직 비어 있어요`,
        message:
          empties.length === 1
            ? `${withTopicJosa(first)} 사진과 설명 없이 저장돼요.`
            : `${first} 외 ${empties.length - 1}곳은 사진과 설명 없이 저장돼요.`,
        cancelLabel: '계속 작성',
        confirmLabel: '저장',
      });
      if (!ok) return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    if (t !== report.title) {
      const r = await useReportStore.getState().update(reportId, { title: t });
      if (!r.ok) {
        savingRef.current = false;
        if (mountedRef.current) {
          setSaving(false);
          setError(r.error);
        }
        return;
      }
    }
    useReportCompletionStore.getState().accept(
      reportId,
      empties.map((r) => r.fr.id),
    );
    if (mode === 'create') recordDuration();
    if (!mountedRef.current) return;
    safeBack(router);
    // 작성을 마치면 보고서 상세(9-3)로. 모달이 내려간 다음 프레임에 연다.
    if (mode === 'create') requestAnimationFrame(() => router.push(reportDetailHref(reportId) as never));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ReportModalHeader
        title={mode === 'create' ? '보고서 작성' : '보고서 수정'}
        onClose={() => {
          if (!savingRef.current) safeBack(router);
        }}
        closeLabel={mode === 'create' ? '나중에 작성하기' : '수정 취소'}
      />
      <KeyboardAvoid style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <Text v2="bodyM.bold" style={styles.label}>
            제목
          </Text>
          <TextField2
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (error) setError(null);
            }}
            maxLength={TITLE_MAX}
            invalid={!!error && !title.trim()}
            accessibilityLabel="보고서 제목"
          />
          {error ? <FieldMessage message={error} style={styles.message} /> : null}

          <View style={[styles.sectionHead, styles.sectionGap]}>
            <Text v2="bodyM.bold">위치도</Text>
            <Touchable
              onPress={() => router.push({ pathname: '/report-overview', params: { id: reportId } } as never)}
              accessibilityRole="button"
              style={styles.link}
            >
              <Text v2="bodyS.bold" tone="link">
                구도 다시 잡기
              </Text>
            </Touchable>
          </View>
          <ReportOverviewMap markers={markers} view={view} style={styles.map} />

          <View style={[styles.sectionHead, styles.sectionGap]}>
            <Text v2="bodyM.bold">현장별 사진과 설명</Text>
            <Touchable onPress={() => setSheetOpen(true)} accessibilityRole="button" accessibilityLabel="현장 추가" style={[styles.link, styles.linkRow]}>
              <Icon name="plus" size={18} color={c2.text.link} />
              <Text v2="bodyS.bold" tone="link">
                현장 추가
              </Text>
            </Touchable>
          </View>
          <View style={styles.list}>
            {rows.map((r, i) => {
              const empty = isFieldReportEmpty(r.fr);
              const { photos, captions } = fieldReportCounts(r.fr);
              const name = fieldName(r.field);
              return (
                <Touchable
                  key={r.fr.id}
                  onPress={() => openRow(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.order}. ${name}, ${empty ? '작성 전' : `사진 ${photos}, 설명 ${captions}`}`}
                  noAutoHitSlop
                  style={[styles.row, i > 0 && styles.rowDivider]}
                >
                  <OrderBadge n={r.order} kind={r.kind} />
                  <View style={styles.rowBody}>
                    <Text v2="bodyL.semibold" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text v2="caption.semibold" tone={empty ? 'warning' : 'tertiary'} numberOfLines={1}>
                      {empty ? '작성 전' : `사진 ${photos} · 설명 ${captions}`}
                    </Text>
                  </View>
                  <SlotMiniBoxes fr={r.fr} />
                  <Icon name="chevron-right" size={18} color={c2.text.disabled} />
                </Touchable>
              );
            })}
            {rows.length === 0 ? (
              <Text v2="bodyS.regular" tone="tertiary" style={styles.emptyRows}>
                아직 넣은 현장이 없어요. [현장 추가]로 넣어 주세요.
              </Text>
            ) : null}
          </View>
        </ScrollView>
        <BottomActionBar style={styles.footer}>
          <Button2 onPress={() => void save()} loading={saving} fullWidth>
            저장
          </Button2>
        </BottomActionBar>
      </KeyboardAvoid>

      <AppSheet open={sheetOpen} onClose={onSheetClose} title="현장 추가" subtitle={sheetSubtitle} scrollable>
        <View style={styles.sheetList}>
          {candidates.list.map((c, i) => {
            const f = fieldById.get(c.fieldId);
            const name = fieldName(f);
            const sub = [f ? districtOf(f.address) : '', c.visitedAt ? `${fmtMonthDay(c.visitedAt)} 방문` : '']
              .filter(Boolean)
              .join(' · ');
            return (
              <Touchable
                key={c.fieldId}
                onPress={() => {
                  picked.current = c;
                  setSheetOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${name} 보고서에 넣기`}
                noAutoHitSlop
                style={[styles.candidate, i > 0 && styles.rowDivider]}
              >
                <View style={styles.plus}>
                  <Icon name="plus" size={16} color={c2.text.link} />
                </View>
                <View style={styles.rowBody}>
                  <Text v2="bodyL.semibold" numberOfLines={1}>
                    {name}
                  </Text>
                  {sub ? (
                    <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
              </Touchable>
            );
          })}
          {candidates.list.length === 0 ? (
            <Text v2="bodyS.regular" tone="tertiary" style={styles.emptyRows}>
              넣을 수 있는 현장이 없어요.
            </Text>
          ) : null}
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  flex: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: space[20], paddingTop: space[8], paddingBottom: space[24] },
  label: { marginBottom: space[8] },
  message: { marginTop: space[8] },
  sectionGap: { marginTop: space[20] },
  sectionHead: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { height: 36, justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  map: { marginTop: space[8] },
  list: { marginTop: space[4] },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[12] },
  rowDivider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  rowBody: { flex: 1, gap: space[2] },
  emptyRows: { paddingVertical: space[16] },
  footer: { paddingTop: space[12], borderTopColor: c2.border.default },
  sheetList: { paddingHorizontal: space[20], paddingTop: space[8] },
  candidate: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  plus: {
    width: 28,
    height: 28,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brandSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

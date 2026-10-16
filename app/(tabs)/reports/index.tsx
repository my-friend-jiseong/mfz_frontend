import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeScreen } from '@/components/SafeScreen';
import { Icon } from '@/components/icons';
import { goToTabRoot } from '@/components/shell/tabNav';
import { Button2 } from '@/components/ui/Button2';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useAuthStore } from '@/stores/authStore';
import { useMiniBarInset } from '@/stores/bottomChromeStore';
import { useReportCompletionStore } from '@/stores/reportCompletionStore';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { fmtMonthDay } from '@/utils/datetime';
import { reportDetailHref, reportEditHref } from '@/utils/reportEntry';
import { useReportStates, type TripReportState } from '@/utils/reportStatus';
import { c2, radius2, space } from '@/theme/v2';
import type { Report } from '@/types/entities';

/**
 * 9 보고서 목록(Figma 541:2511) · 9-1 0건(541:2582). 검색·필터 없음(v138).
 * 위 '작성 중' 카드([이어서 작성] → 9-2, [삭제] → 9-13), 아래 '작성 완료' 줄(→ 9-3).
 * 작성 중은 빈 현장 보고로 계산한다(서버에 상태 칸이 없음, 백로그 2차 B) — 상세를 받기 전(checking)엔 작성 완료 쪽에 둔다.
 */
export default function ReportsIndex() {
  const router = useRouter();
  const miniBarInset = useMiniBarInset();
  const userId = useAuthStore((s) => s.user?.id);
  const allReports = useReportStore((s) => s.reports);
  const listStatus = useReportStore((s) => s.listStatus);
  const listLoaded = useReportStore((s) => s.listLoaded);
  const trips = useTripStore((s) => s.trips);

  // 탭에 들어올 때마다 목록을 다시 받는다(외근 상세·다른 기기에서 만든 보고서).
  useFocusEffect(
    useCallback(() => {
      void useReportStore.getState().refresh();
    }, []),
  );

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  // 외근 날짜(없으면 만든 날) 최신순.
  const dateOf = useCallback(
    (r: Report) => (r.tripId ? tripById.get(r.tripId)?.startedAt : undefined) ?? r.createdAt,
    [tripById],
  );
  const mine = useMemo(
    () =>
      allReports
        .filter((r) => !userId || r.creatorId === userId)
        .sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
    [allReports, userId, dateOf],
  );
  const ids = useMemo(() => mine.map((r) => r.id), [mine]);
  const states = useReportStates(ids);
  const drafts = mine.filter((r) => states.get(r.id)?.stage === 'draft');
  const rest = mine.filter((r) => states.get(r.id)?.stage !== 'draft');

  const remove = async (r: Report) => {
    const ok = await confirm({
      title: '보고서를 삭제할까요?',
      message: '외근 기록은 그대로 남아요.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    const res = await useReportStore.getState().remove(r.id);
    if (!res.ok) {
      await notice('보고서를 삭제하지 못했어요', res.error);
      return;
    }
    useReportCompletionStore.getState().forget(r.id);
  };

  const loading = !listLoaded && listStatus !== 'error';
  const failed = !listLoaded && listStatus === 'error';

  return (
    <SafeScreen background={c2.bg.canvas}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: space[24] + miniBarInset }, mine.length === 0 && styles.grow]}
      >
        <Text v2="display" accessibilityRole="header" style={styles.title}>
          보고서
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={c2.text.tertiary} />
          </View>
        ) : failed ? (
          <View style={styles.center}>
            <Text v2="bodyM.semibold">보고서를 불러오지 못했어요</Text>
            <Button2 variant="outline" size="M" onPress={() => void useReportStore.getState().refresh()} style={styles.emptyBtn}>
              다시 시도
            </Button2>
          </View>
        ) : mine.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Icon name="document-blank" size={30} color={c2.text.tertiary} />
            </View>
            <Text v2="title.s" style={styles.emptyTitle}>
              아직 만든 보고서가 없어요
            </Text>
            <Text v2="bodyS.regular" tone="tertiary" style={styles.emptyText}>
              {'외근을 마친 뒤 외근 상세에서\n보고서를 작성할 수 있어요.'}
            </Text>
            <Button2 variant="outline" size="M" onPress={() => goToTabRoot('trips')} style={styles.emptyBtn}>
              외근 내역 보기
            </Button2>
          </View>
        ) : (
          <>
            {drafts.length > 0 ? (
              <View>
                <Text v2="bodyS.bold" tone="secondary" style={styles.section}>
                  작성 중
                </Text>
                <View style={styles.cards}>
                  {drafts.map((r) => (
                    <DraftCard
                      key={r.id}
                      report={r}
                      date={dateOf(r)}
                      state={states.get(r.id)}
                      onOpen={() => router.push(reportDetailHref(r.id) as never)}
                      onContinue={() => router.push(reportEditHref(r.id, 'create') as never)}
                      onDelete={() => void remove(r)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {rest.length > 0 ? (
              <View>
                <Text v2="bodyS.bold" tone="secondary" style={[styles.section, drafts.length > 0 && styles.sectionGap]}>
                  작성 완료
                </Text>
                {rest.map((r, i) => {
                  const total = states.get(r.id)?.total ?? null;
                  const meta = [fmtMonthDay(dateOf(r)), total != null ? `현장 ${total}곳` : ''].filter(Boolean).join(' · ');
                  return (
                    <Touchable
                      key={r.id}
                      onPress={() => router.push(reportDetailHref(r.id) as never)}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.title}, ${meta}`}
                      noAutoHitSlop
                      style={[styles.row, i > 0 && styles.rowDivider]}
                    >
                      <View style={styles.docIcon}>
                        <Icon name="document" size={20} color={c2.text.secondary} />
                      </View>
                      <View style={styles.flex}>
                        <Text v2="bodyL.semibold" numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
                          {meta}
                        </Text>
                      </View>
                    </Touchable>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

function DraftCard({
  report,
  date,
  state,
  onOpen,
  onContinue,
  onDelete,
}: {
  report: Report;
  date: string;
  state: TripReportState | undefined;
  onOpen: () => void;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const progress = state?.total != null ? ` · 현장 ${state.total}곳 중 ${state.filled ?? 0}곳 작성` : '';
  const meta = `${fmtMonthDay(date)} 외근${progress}`;
  return (
    <View style={styles.card}>
      <Touchable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${report.title}, ${meta}`} noAutoHitSlop>
        <Text v2="button" numberOfLines={1}>
          {report.title}
        </Text>
        <Text v2="caption.regular" tone="tertiary" numberOfLines={1} style={styles.cardMeta}>
          {meta}
        </Text>
      </Touchable>
      <View style={styles.cardActions}>
        <Button2 size="M" onPress={onContinue} style={styles.flex}>
          이어서 작성
        </Button2>
        <Button2 size="M" variant="danger" onPress={onDelete} accessibilityLabel={`${report.title} 삭제`}>
          삭제
        </Button2>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  scroll: { paddingHorizontal: space[20] },
  // Figma 9: 상태 표시줄 아래 12 에 큰 제목(10 내 정보와 같다).
  title: { marginTop: space[12], marginBottom: space[12] },
  section: { marginTop: space[8], marginBottom: space[8] },
  sectionGap: { marginTop: space[24] },
  cards: { gap: space[12] },
  // 카드는 목록 줄보다 좌우로 4 넓다(Figma: 카드 x16, 줄 x20).
  card: {
    marginHorizontal: -space[4],
    padding: space[16],
    borderRadius: radius2.card,
    borderWidth: 1.5,
    borderColor: c2.border.default,
  },
  cardMeta: { marginTop: space[2] },
  cardActions: { flexDirection: 'row', gap: space[8], marginTop: space[14] },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: space[12] },
  rowDivider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius2.md,
    backgroundColor: c2.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 9-1: 빈 화면 안내는 위아래 가운데보다 조금 위(탭 바 위 여백만큼).
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: space[32] * 2 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { marginTop: space[16] },
  emptyText: { marginTop: space[8], textAlign: 'center' },
  emptyBtn: { marginTop: space[24] },
});

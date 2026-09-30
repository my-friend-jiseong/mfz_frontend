import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { NavHeader } from '@/components/ui/NavHeader';
import { showActionSheet } from '@/components/ui/ActionSheet';
import { ReorderButtons, reorderA11yProps, swapAt } from '@/components/ui/ReorderButtons';
import { SafeScreen } from '@/components/SafeScreen';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { safeBack } from '@/utils/backNavigation';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { VISIT_STATUS_LABEL, type Visit } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { fmtDate, fmtTime } from '@/utils/datetime';

// 보고서 작성 (명세 v2 FE-RPT-02·02a·10).
// 제목 + 연결 외근 + 보고서에 넣을 현장(= 그 외근의 체크인한 방문, 방문 순서). ▲▼ 로 바꾼 순서가
// 곧 현장 보고 순서다. 위치도는 없다(상세 화면에 있다). 만들면 현장 보고 마법사(1/N)로 간다.
export default function ComposeReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  const createWithVisitScaffold = useReportStore((s) => s.createWithVisitScaffold);
  const allTrips = useTripStore((s) => s.trips);
  const loadTripDetail = useTripStore((s) => s.loadDetail);
  const userId = useAuthStore((s) => s.user?.id);
  const allVisits = useVisitStore((s) => s.visits);
  const getField = useFieldStore((s) => s.getById);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 사용자가 ▲▼ 로 정한 방문 순서(visitId). null 이면 아직 손대지 않음 → 방문 시각 순.
  const [order, setOrder] = useState<string[] | null>(null);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  // 무결성 검증 (G4/F6) — params.tripId 가 본인 외근이 아니면 reset.
  useEffect(() => {
    if (!params.tripId || myTrips.length === 0) return;
    if (!myTrips.some((t) => t.id === params.tripId)) {
      setTripId(null);
      setError('전달된 외근이 본인 소유가 아니어서 선택을 해제했습니다. 외근을 직접 선택해주세요.');
    }
  }, [params.tripId, myTrips]);

  const tripHydrating = useTripStore((s) => (tripId ? s.detailStatus[tripId] === 'loading' : false));
  const tripIsOwned = useMemo(
    () => (tripId ? myTrips.some((t) => t.id === tripId) : false),
    [tripId, myTrips],
  );

  useEffect(() => {
    if (!tripId || !tripIsOwned) return;
    void loadTripDetail(tripId);
  }, [tripId, tripIsOwned, loadTripDetail]);

  // 외근을 바꾸면 순서도 처음부터.
  useEffect(() => setOrder(null), [tripId]);

  const selectedTrip = useMemo(
    () => (tripId ? myTrips.find((t) => t.id === tripId) ?? null : null),
    [myTrips, tripId],
  );

  // 체크인한 방문만(FE-RPT-10) — 방문(visit) 자체가 체크인 기록이라 건너뛴 목적지는 여기 없다.
  // 같은 현장을 두 번 방문했으면 행은 먼저 방문한 것 하나(현장 보고는 현장 단위), 사진은 모든 방문에서.
  const allTripVisits = useMemo(
    () =>
      tripId
        ? allVisits
            .filter((v) => v.tripId === tripId && v.fieldId)
            .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
        : [],
    [tripId, allVisits],
  );
  const tripVisits = useMemo(() => {
    const seen = new Set<string>();
    return allTripVisits.filter((v) => (seen.has(v.fieldId) ? false : (seen.add(v.fieldId), true)));
  }, [allTripVisits]);

  const ordered = useMemo<Visit[]>(() => {
    if (!order) return tripVisits;
    const byId = new Map(tripVisits.map((v) => [v.id, v]));
    const out = order.map((id) => byId.get(id)).filter((v): v is Visit => !!v);
    // 순서를 정한 뒤 새로 들어온 방문(상세 재로딩)은 끝에 붙인다.
    for (const v of tripVisits) if (!order.includes(v.id)) out.push(v);
    return out;
  }, [order, tripVisits]);

  useEffect(() => {
    for (const v of tripVisits) {
      if (!useFieldStore.getState().getById(v.fieldId)) void loadFieldDetail(v.fieldId);
    }
  }, [tripVisits, loadFieldDetail]);

  const move = (from: number, to: number) => setOrder(swapAt(ordered, from, to).map((v) => v.id));

  const openTripPicker = () =>
    showActionSheet(
      myTrips.map((t) => ({
        label: `${t.title || `${fmtDate(t.startedAt)} 외근`} · ${fmtDate(t.startedAt)}`,
        selected: t.id === tripId,
        onPress: () => setTripId(t.id),
      })),
      '연결할 외근 선택',
    );

  const noTripsAtAll = myTrips.length === 0;
  const blockedReason = noTripsAtAll
    ? null
    : !tripId
      ? '연결할 외근을 선택해주세요'
      : tripHydrating
        ? '외근 정보를 불러오는 중입니다'
        : !title.trim()
          ? '제목을 입력하면 보고서를 만들 수 있어요'
          : null;

  const handleSubmit = async () => {
    setError(null);
    const t = title.trim();
    if (t.length < 1 || t.length > 100) {
      setError('제목은 1~100자로 입력해주세요');
      return;
    }
    if (!tripId || tripHydrating) return;
    setSubmitting(true);
    const r = await createWithVisitScaffold(
      { title: t, tripId },
      ordered.map((v) => ({
        fieldId: v.fieldId,
        visitIds: allTripVisits.filter((x) => x.fieldId === v.fieldId).map((x) => x.id),
      })),
    );
    setSubmitting(false);
    if (!r.ok) {
      Alert.alert('보고서 생성 실패', r.error);
      return;
    }
    if (r.failedFieldIds.length > 0) {
      const names = r.failedFieldIds
        .slice(0, 5)
        .map((fid) => getField(fid)?.address ?? `현장 ${fid.slice(0, 6)}`)
        .join('\n· ');
      const overflow = r.failedFieldIds.length > 5 ? `\n· 외 ${r.failedFieldIds.length - 5}건` : '';
      Alert.alert(
        '일부 현장 보고 누락',
        `현장 보고 ${r.attemptedFieldIds.length}건 중 ${r.failedFieldIds.length}건을 만들지 못했습니다.\n\n· ${names}${overflow}\n\n상세 화면의 '현장 보고 추가' 로 다시 넣을 수 있어요.`,
      );
    }
    router.replace(
      (r.firstFieldReportId
        ? `/(tabs)/reports/${r.report.id}/field-report?frId=${r.firstFieldReportId}&wizard=1`
        : `/(tabs)/reports/${r.report.id}`) as never,
    );
  };

  return (
    <SafeScreen>
      <NavHeader title="보고서 작성" onBack={() => safeBack(router, '/(tabs)/reports')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Input
            label="제목"
            value={title}
            onChangeText={setTitle}
            placeholder="예: 2026-08-28 사하구 낙동대로 일대 보고서"
            maxLength={100}
          />

          <FieldLabel style={styles.sectionGap}>연결 외근</FieldLabel>
          {selectedTrip ? (
            <Card padding="md" style={styles.tripCard}>
              <View style={styles.tripCardHead}>
                <Ionicons name="briefcase" size={16} color={colors.primary} />
                <Text variant="body" weight="semibold" style={styles.flex}>
                  {selectedTrip.title || `${fmtDate(selectedTrip.startedAt)} 외근`}
                </Text>
              </View>
              <Text variant="caption" color="textMuted">
                {fmtDate(selectedTrip.startedAt)} {fmtTime(selectedTrip.startedAt)}
                {selectedTrip.endedAt ? ` ~ ${fmtTime(selectedTrip.endedAt)}` : ' · 진행 중'}
                {' · 방문 '}
                {tripVisits.length}곳
              </Text>
              {!params.tripId ? (
                <Button
                  onPress={openTripPicker}
                  variant="ghost"
                  size="sm"
                  leftIcon="swap-horizontal"
                  style={styles.changeBtn}
                >
                  외근 변경
                </Button>
              ) : null}
            </Card>
          ) : noTripsAtAll ? (
            <Card padding="md" style={styles.noTripsCard}>
              <Text variant="bodySm" weight="bold">
                아직 작성된 외근이 없어요
              </Text>
              <Text variant="caption" color="textMuted">
                보고서는 외근 단위로 만들어집니다. 먼저 외근을 시작해 현장을 방문해주세요.
              </Text>
            </Card>
          ) : (
            <Button onPress={openTripPicker} variant="secondary" fullWidth leftIcon="briefcase-outline">
              외근 선택
            </Button>
          )}

          {selectedTrip ? (
            <>
              <FieldLabel style={styles.sectionGap}>보고서에 넣을 현장 ({ordered.length})</FieldLabel>
              {tripHydrating && ordered.length === 0 ? (
                <Text variant="bodySm" color="textMuted">
                  외근 정보를 불러오는 중…
                </Text>
              ) : ordered.length === 0 ? (
                <Text variant="bodySm" color="textMuted">
                  체크인한 방문이 없어 현장 보고가 만들어지지 않습니다. 보고서 상세에서 직접 추가할 수 있어요.
                </Text>
              ) : (
                ordered.map((v, i) => {
                  const field = getField(v.fieldId);
                  const badge = VISIT_STATUS_BADGE[v.status];
                  const detail = field ? fieldDetailLine(field) : null;
                  return (
                    <Card
                      key={v.id}
                      padding="md"
                      style={styles.row}
                      {...reorderA11yProps(i, ordered.length, move)}
                    >
                      <View style={styles.orderBadge}>
                        <Text variant="bodySm" weight="bold" color="onPrimary" numeric>
                          {i + 1}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <View style={styles.rowTop}>
                          <Text variant="bodySm" weight="bold" color="textMuted" numeric>
                            {fmtTime(v.visitedAt)}
                          </Text>
                          <Badge label={VISIT_STATUS_LABEL[v.status]} tone={badge.tone} shape={badge.shape} size="sm" />
                        </View>
                        <Text variant="body" weight="semibold" numberOfLines={1}>
                          {field?.address ?? '알 수 없는 현장'}
                        </Text>
                        {detail ? (
                          <Text variant="caption" color="textMuted" numberOfLines={1}>
                            {detail}
                          </Text>
                        ) : null}
                      </View>
                      <ReorderButtons index={i} count={ordered.length} onMove={move} />
                    </Card>
                  );
                })
              )}
            </>
          ) : null}

          {error ? (
            <Text variant="bodySm" color="danger" style={styles.message}>
              {error}
            </Text>
          ) : blockedReason ? (
            <Text variant="caption" color="textMuted" style={styles.message}>
              {blockedReason}
            </Text>
          ) : ordered.length > 0 ? (
            <Text variant="caption" color="textMuted" style={styles.message}>
              보고서를 만들면 위 순서대로 현장 보고 {ordered.length}건이 만들어집니다.
            </Text>
          ) : null}

          <Button
            onPress={() => void handleSubmit()}
            disabled={!tripId || !title.trim() || submitting || tripHydrating || noTripsAtAll}
            loading={submitting}
            size="lg"
            fullWidth
            leftIcon="document-text"
            style={styles.submit}
          >
            보고서 만들기
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  sectionGap: { marginTop: spacing.xl },
  tripCard: { gap: spacing.xs },
  tripCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  changeBtn: { alignSelf: 'flex-start' },
  noTripsCard: { backgroundColor: colors.surfaceMuted, borderWidth: 0, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { marginTop: spacing.lg },
  submit: { marginTop: spacing.md },
});

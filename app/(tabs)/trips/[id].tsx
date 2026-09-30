import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { DESTINATION_STATUS_BADGE } from '@/theme/statusBadge';
import { Button } from '@/components/ui/Button';
import { BottomActionBar, BOTTOM_ACTION_BAR_HEIGHT } from '@/components/ui/BottomActionBar';
import { EditableTitle } from '@/components/ui/EditableTitle';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { ReviewVisitCard } from '@/components/trips/ReviewVisitCard';
import { memoForVisit } from '@/utils/visitRecord';
import { visitInReport } from '@/utils/visitGuards';
import { safeBack } from '@/utils/backNavigation';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { fmtDate, fmtDateTime, fmtDuration } from '@/utils/datetime';

// 외근 상세 — 종료된 외근 전용. 진행 중인 외근은 activeTripId === id 가드로 active 화면에 위임.
// 명세 v2 §4.3: 방문 카드는 읽기 전용 요약(펼침)이고, 고치는 곳은 방문 수정 화면이다.
export default function TripDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ?? '';

  const trip = useTripStore((s) => (id ? s.getById(id) : undefined));
  const activeTripId = useTripStore((s) => s.activeTripId);
  const loadTripDetail = useTripStore((s) => s.loadDetail);
  // selector 안에서 .filter().sort() 호출하면 매 호출마다 새 array reference →
  // useSyncExternalStoreWithSelector 가 무한 re-render → React error #185.
  // raw 배열 구독 + useMemo 로 도출 (fields/new 와 동일 패턴).
  const allVisits = useVisitStore((s) => s.visits);
  const allDestinations = useDestinationStore((s) => s.destinations);
  const getField = useFieldStore((s) => s.getById);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const directAttachments = useFieldStore((s) => s.directAttachments);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const loadVisitPhotos = useVisitStore((s) => s.loadPhotos);
  const removeVisit = useVisitStore((s) => s.remove);
  const updateTrip = useTripStore((s) => s.update);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const visits = useMemo(
    () =>
      id
        ? allVisits
            .filter((v) => v.tripId === id)
            .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
        : [],
    [allVisits, id],
  );
  const destinations = useMemo(
    () =>
      id
        ? allDestinations
            .filter((d) => d.tripId === id)
            .sort((a, b) => a.order - b.order)
        : [],
    [allDestinations, id],
  );

  // 지도 마커용 현장 id — 계획된 destinations 우선(순서 보존), 누락분은 방문(visit) fieldId 로 보완.
  // destinations 는 client-only(AsyncStorage)라 다른 세션/기기/캐시 정리 후엔 비어 있는데, 완료된 외근은
  // timeline→visit 의 fieldId(라이브 확인됨)로 현장을 도출 가능 → 마커가 빈 회로 차단. (backend-backlog §11)
  const tripFieldIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const d of destinations) {
      if (d.fieldId && !seen.has(d.fieldId)) {
        seen.add(d.fieldId);
        ids.push(d.fieldId);
      }
    }
    for (const v of visits) {
      if (v.fieldId && !seen.has(v.fieldId)) {
        seen.add(v.fieldId);
        ids.push(v.fieldId);
      }
    }
    return ids;
  }, [destinations, visits]);

  // Hooks must be called unconditionally — 모든 useMemo/useEffect/useRef 를 가드 위로.
  // 건너뛴 현장 = 직접 건너뛴 목적지 + 방문 없이 종료된 목적지(명세 FE-OUT-09: 외근 종료 시
  // 남은 방문은 건너뜀·미정). **종료된 외근일 때만** — 콜드스타트·다른 기기에서 시작한 진행 중
  // 외근이 activeTripId 가드를 빠져나와 이 화면에 오면, 아직 안 간 목적지까지 건너뜀으로 셌다(리뷰).
  const tripEnded = !!trip?.endedAt;
  const skippedDestinations = useMemo(() => {
    const visited = new Set(visits.map((v) => v.fieldId));
    return destinations.filter(
      (d) =>
        d.status === 'skipped' || (tripEnded && d.status === 'pending' && !visited.has(d.fieldId)),
    );
  }, [destinations, visits, tripEnded]);

  // visit 을 카드 데이터의 진실값으로. destination 이 살아있으면 order 만 그쪽에서 가져옴.
  const destinationByFieldId = useMemo(() => {
    const map = new Map<string, typeof destinations[number]>();
    for (const d of destinations) map.set(d.fieldId, d);
    return map;
  }, [destinations]);

  // visit-기반 카드 — 정렬은 destination.order 우선, 없으면 visitedAt.
  const visitCards = useMemo(() => {
    const annotated = visits.map((v) => {
      const d = destinationByFieldId.get(v.fieldId);
      return {
        visit: v,
        fieldId: v.fieldId,
        order: d?.order ?? null,
      };
    });
    annotated.sort((a, b) => {
      if (a.order != null && b.order != null) return a.order - b.order;
      if (a.order != null) return -1;
      if (b.order != null) return 1;
      return a.visit.visitedAt.localeCompare(b.visit.visitedAt);
    });
    // 표시 순번은 정렬된 위치(1-based) — destination.order 의 base(서버 0-based 등)에 비의존.
    // 0-based order 를 raw 로 쓰면 "0번째" 가 나오던 회로 차단 (active.tsx 와 동일 규칙).
    return annotated.map((c, i) => ({
      ...c,
      displayOrder: i + 1,
    }));
  }, [visits, destinationByFieldId]);

  // 진입 시 trip detail 페치 — visit timeline 을 visitStore 로 sync.
  // 새로고침 / 다른 디바이스 진입 직후 visitStore 가 비어있어 카드가 안 보이는 회로 차단.
  const fetchedTripRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id) return;
    if (fetchedTripRef.current === id) return;
    fetchedTripRef.current = id;
    void loadTripDetail(id);
  }, [id, loadTripDetail]);

  // 진입 시 각 visit field 의 메모/사진 캐시 페치 — directAttachments 가 비어 있을 수 있음.
  //
  // 무한 루프 차단 — 2중 가드:
  //   1) deps 는 fieldIds 의 stable string key (같은 ids 면 effect 안 재실행)
  //   2) ref guard 로 이미 페치한 fieldId 중복 호출 X
  const fieldIdsKey = useMemo(
    () =>
      visitCards
        .map((c) => c.fieldId)
        .sort()
        .join(','),
    [visitCards],
  );
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!fieldIdsKey) return;
    for (const fid of fieldIdsKey.split(',')) {
      if (fetchedRef.current.has(fid)) continue;
      fetchedRef.current.add(fid);
      void loadFieldDetail(fid);
    }
  }, [fieldIdsKey, loadFieldDetail]);

  // 방문별 사진 — 펼친 요약에만 보이므로 처음 펼칠 때 받는다(방문 수만큼 요청이 나가지 않게).
  const fetchedVisitPhotosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!id) return;
    for (const vid of expandedIds) {
      if (fetchedVisitPhotosRef.current.has(vid)) continue;
      fetchedVisitPhotosRef.current.add(vid);
      void loadVisitPhotos(id, vid);
    }
  }, [id, expandedIds, loadVisitPhotos]);

  // 가드 — hooks 호출 끝난 뒤로 옮김 (Rules of Hooks).
  // 잘못된 진입 — tripId 없음
  if (!id) {
    return (
      <MapSheetLayout title="외근 정리" onBack={() => safeBack(router)}>
        <EmptyState
          icon="alert-circle-outline"
          title="외근 정보가 없습니다"
          description="외근 목록에서 다시 진입해주세요"
        />
      </MapSheetLayout>
    );
  }

  // 트립이 store 에 없으면 — race 가능성. 단순 EmptyState 로 (별도 fetch 없음).
  if (!trip) {
    return (
      <MapSheetLayout title="외근 정리" onBack={() => safeBack(router)}>
        <EmptyState
          icon="search-outline"
          title="외근을 찾을 수 없습니다"
          description="삭제됐거나 다른 사용자의 외근일 수 있습니다"
        />
      </MapSheetLayout>
    );
  }

  // 아직 진행 중인 트립으로 들어왔다면 active 화면으로 — 정리는 종료 후에만.
  if (activeTripId === id) {
    return <Redirect href="/(tabs)/trips/active" />;
  }

  const visitCount = visits.length;
  const skippedCount = skippedDestinations.length;
  // 계획 totalDest — destination 살아있으면 그 길이, 없으면 visit + skipped 합계로 추정.
  // active.finalizeEnd 가 종료 직후 removeByTrip 으로 destinations 를 정리하므로
  // 종료 후 review 재진입에선 destinations 가 비어있을 수 있음 — visit 으로 폴백.
  const totalDest = destinations.length || visitCount + skippedCount;

  const toggle = (visitId: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(visitId)) next.delete(visitId);
      else next.add(visitId);
      return next;
    });

  // FE-WRAP-05 — 빈 값은 EditableTitle 이 이전 제목으로 되돌린다. 실패하면 입력칸을 남긴다.
  const saveTitle = async (title: string) => {
    const r = await updateTrip(id, { title });
    if (!r.ok) {
      Alert.alert('제목 저장 실패', r.error);
      throw new Error(r.error);
    }
  };

  // FE-WRAP-03 — 스와이프 삭제. 보고서에 반영된 방문이면 차단.
  const deleteVisit = async (visitId: string, fieldId: string) => {
    if (await visitInReport(id, fieldId)) {
      await notice('삭제할 수 없습니다', '보고서에서 먼저 삭제해야 합니다.');
      return;
    }
    const ok = await confirm({
      title: '이 방문을 삭제할까요?',
      message: '현장은 남고, 이 방문의 기록만 지워집니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    const r = await removeVisit(visitId);
    if (r.ok) toast('방문을 삭제했습니다');
    else if ('unsupported' in r) {
      await notice('아직 지원되지 않는 기능입니다', '방문 삭제는 서버 준비 후 사용할 수 있습니다.');
    } else Alert.alert('방문 삭제 실패', r.error);
  };

  return (
    <View style={styles.screenRoot}>
      <MapSheetLayout
        title="외근 정리"
        onBack={() => safeBack(router)}
        initialIndex={2}
        mapFieldIds={tripFieldIds}
        // tripFieldIds 는 destination.order → visit 순으로 쌓인 방문 순서 그대로다(위 memo 참고).
        routeFieldIds={tripFieldIds}
      >
        <BottomSheetScrollView style={sheetScrollableStyle} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          {/* 제목을 탭하면 그 자리에서 고친다(FE-WRAP-05). 헤더 수정 아이콘은 없다(FE-WRAP-04). */}
          <EditableTitle
            value={trip.title || `${fmtDate(trip.startedAt)} 외근`}
            onSubmit={saveTitle}
            maxLength={50}
            label="외근 제목"
          />
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text variant="bodySm" color="textMuted">
              {fmtDateTime(trip.startedAt)}
              {trip.endedAt ? ` ~ ${fmtDateTime(trip.endedAt)}` : ' · 진행 중'}
              {trip.endedAt
                ? ` · ${fmtDuration(trip.startedAt, trip.endedAt)}`
                : ''}
            </Text>
          </View>
          {/* 이 화면의 focal — "이 외근이 어땠나" 에 답하는 집계 (강령 1·8).
              방문이 답이고 건너뜀·계획은 그 답을 읽는 맥락이라 한 단계 낮춘다.
              이전엔 셋 다 body(16) 동일 크기 + 세로 divider 3분할이라 무엇이 답인지
              안 보였다. 구분은 divider 가 아니라 여백·크기로 한다. */}
          <Card padding="lg" style={styles.statsCard}>
            <View style={styles.statCol}>
              <Text variant="caption" weight="semibold" color="textMuted">
                방문
              </Text>
              <Text variant="metric" color="primary">
                {visitCount}
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text variant="caption" weight="semibold" color="textMuted">
                건너뜀
              </Text>
              <Text variant="metricSm" color="textMuted">
                {skippedCount}
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text variant="caption" weight="semibold" color="textMuted">
                계획
              </Text>
              <Text variant="metricSm">{totalDest}</Text>
            </View>
          </Card>
        </View>

        {visitCount === 0 && skippedCount === 0 ? (
          <EmptyState
            icon="footsteps-outline"
            title="방문 기록 없이 종료된 외근입니다"
            description="현장에 들르지 않았거나, 강제 종료된 외근입니다"
          />
        ) : (
          <>
            {visitCards.length > 0 ? (
              <>
                <Text
                  variant="bodySm"
                  weight="bold"
                  color="textMuted"
                  style={styles.sectionTitle}
                >
                  방문한 현장 정리 ({visitCards.length})
                </Text>
                {visitCards.map((c) => {
                  const field = getField(c.fieldId);
                  const vid = c.visit.id;
                  return (
                    <ReviewVisitCard
                      key={vid}
                      visit={c.visit}
                      order={c.displayOrder}
                      fieldAddress={field?.address ?? '알 수 없는 현장'}
                      fieldAddressDetail={field?.addressDetail || undefined}
                      memo={memoForVisit(directAttachments[c.fieldId], c.visit.visitedAt)?.text}
                      photos={photosByVisit[vid]}
                      expanded={expandedIds.has(vid)}
                      onToggle={() => toggle(vid)}
                      onEdit={() => router.push(`/(tabs)/trips/${id}/visits/${vid}` as never)}
                      onDelete={() => void deleteVisit(vid, c.fieldId)}
                    />
                  );
                })}
              </>
            ) : null}

            {skippedDestinations.length > 0 ? (
              <View style={styles.skippedSection}>
                <Text
                  variant="bodySm"
                  weight="bold"
                  color="textMuted"
                  style={styles.sectionTitle}
                >
                  건너뛴 현장 ({skippedDestinations.length})
                </Text>
                {skippedDestinations.map((d, i) => {
                  const field = getField(d.fieldId);
                  return (
                    <Card key={d.id} padding="md" style={styles.skippedCard}>
                      <View style={styles.skippedHead}>
                        <View style={styles.skippedOrderBadge}>
                          <Text variant="caption" weight="bold" color="textMuted" numeric>
                            {i + 1}
                          </Text>
                        </View>
                        <View style={styles.skippedBody}>
                          <Text variant="body" weight="semibold" numberOfLines={1}>
                            {field?.address ?? '알 수 없는 현장'}
                          </Text>
                          {/* 주소가 이미 상세주소로 끝나면 중복이다 (fieldFacets 규칙). */}
                          {field && fieldDetailLine(field) ? (
                            <Text variant="caption" color="textMuted" numberOfLines={1}>
                              {fieldDetailLine(field)}
                            </Text>
                          ) : null}
                        </View>
                        {/* 결과는 미정 — 체크인 없이 건너뛴 방문(명세 §1.4·수락 기준 7). */}
                        <Badge
                          label={DESTINATION_STATUS_BADGE.skipped.label}
                          tone={DESTINATION_STATUS_BADGE.skipped.tone}
                          shape={DESTINATION_STATUS_BADGE.skipped.shape}
                          size="sm"
                        />
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
        </BottomSheetScrollView>
      </MapSheetLayout>
      {/* StickyBottomBar 는 BottomSheet 외부에 — 시트 내부 absolute 자식의 터치를
          @gorhom/bottom-sheet 의 pan 제스처가 가로채는 회로 차단. (active.tsx 와 동일 패턴) */}
      <BottomActionBar absolute>
        <Button
          onPress={() => router.push(`/(tabs)/reports/new?tripId=${id}` as never)}
          size="lg"
          fullWidth
          leftIcon="document-text"
        >
          보고서 작성
        </Button>
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  // 하단 액션 바 뒤로 마지막 카드가 숨지 않게 — 바 높이 + 시트 래퍼 여유(active.tsx ★ 주석과 같은 이유).
  scroll: { padding: spacing.lg, paddingBottom: BOTTOM_ACTION_BAR_HEIGHT + spacing.xxl * 3 },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // 정렬 기준은 라벨 줄(위)이다. 라벨은 셋 다 caption 이라 한 줄로 맞고, 크기가 큰
  // 방문 숫자만 아래로 더 자란다 — 그게 위계로 읽힌다. 바닥을 맞추면(flex-end) 반대로
  // 작은 열의 라벨이 6px 내려앉아 어긋난 것처럼 보인다(실측).
  // 열을 flex 로 늘리지 않고 왼쪽에 모아 두고 오른쪽은 비운다 — 여백이 divider 를 대신한다.
  statsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  statCol: { gap: spacing.xs },
  sectionTitle: { marginBottom: spacing.sm },
  skippedSection: { marginTop: spacing.lg },
  skippedCard: {
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
  },
  skippedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skippedOrderBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skippedBody: { flex: 1 },
});

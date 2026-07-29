import { useEffect, useMemo, useRef } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { Button } from '@/components/ui/Button';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { ReviewVisitCard } from '@/components/trips/ReviewVisitCard';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate, fmtDateTime, fmtDuration } from '@/utils/datetime';

// 외근 상세 — 종료된 외근 전용. 진행 중인 외근은 activeTripId === id 가드로 active 화면에 위임.
// visit 결과 정정 + 현장 메모/사진을 한 화면에서 마무리.
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
  const skippedDestinations = useMemo(
    () => destinations.filter((d) => d.status === 'skipped'),
    [destinations],
  );

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

  const isActiveTrip = activeTripId === id;
  const canDelete = !isActiveTrip;

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
          <View style={styles.titleRow}>
            <Text variant="h2" weight="heavy" style={styles.titleText}>
              {trip.title || `${fmtDate(trip.startedAt)} 외근`}
            </Text>
            {/* 수정 진입만 노출. 삭제(파괴적)는 수정 화면 하단 '위험 구역'으로 이동해
                일상 동작 옆 빨강 휴지통의 오탭·과대 비중을 제거. (fields edit 패턴과 일치) */}
            {canDelete ? (
              <Pressable
                onPress={() => router.push(`/(tabs)/trips/${id}/edit` as never)}
                accessibilityRole="button"
                accessibilityLabel="외근 수정"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.editBtn,
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Ionicons name="create-outline" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
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
                  return (
                    <ReviewVisitCard
                      key={c.visit.id}
                      visit={c.visit}
                      order={c.displayOrder}
                      fieldId={c.fieldId}
                      fieldAddress={field?.address ?? '알 수 없는 현장'}
                      fieldAddressDetail={field?.addressDetail || undefined}
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
                          {field?.addressDetail ? (
                            <Text variant="caption" color="textMuted" numberOfLines={1}>
                              {field.addressDetail}
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="caption" weight="bold" color="textMuted">
                          건너뜀
                        </Text>
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
      <StickyBottomBar>
        <Button
          onPress={() => router.push(`/(tabs)/reports/new?tripId=${id}` as never)}
          size="lg"
          fullWidth
          leftIcon="document-text"
        >
          보고서 작성
        </Button>
      </StickyBottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleText: { flex: 1 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
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

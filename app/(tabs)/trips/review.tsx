import { useEffect, useMemo, useRef } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { ReviewVisitCard } from '@/components/trips/ReviewVisitCard';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { fmtDate, fmtDateTime, fmtDuration } from '@/utils/datetime';

// 외근 종료 직후 진입 — visit 결과 정정 + 현장 메모/사진을 한 화면에서 마무리.
// 단계 1: shell + 헤더 + 가드 (visit 카드/skipped 섹션/CTA 는 후속 단계).
export default function TripReview() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const id = tripId ?? '';

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

  const tripFieldIds = useMemo(
    () => destinations.map((d) => d.fieldId),
    [destinations],
  );

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
    // order 가 없는 카드는 그 자리 순번을 부여.
    return annotated.map((c, i) => ({
      ...c,
      displayOrder: c.order ?? i + 1,
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

  return (
    <View style={styles.screenRoot}>
      <MapSheetLayout
        title="외근 정리"
        onBack={() => safeBack(router)}
        initialIndex={2}
        mapFieldIds={tripFieldIds}
      >
        <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="h2" weight="heavy">
            {trip.title || `${fmtDate(trip.startedAt)} 외근`}
          </Text>
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
          <Card padding="md" style={styles.statsCard}>
            <View style={styles.statRow}>
              <Text variant="caption" weight="bold" color="textMuted">
                방문
              </Text>
              <Text variant="body" weight="heavy" color="primary">
                {visitCount}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statRow}>
              <Text variant="caption" weight="bold" color="textMuted">
                건너뜀
              </Text>
              <Text variant="body" weight="heavy" color="textMuted">
                {skippedCount}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statRow}>
              <Text variant="caption" weight="bold" color="textMuted">
                계획
              </Text>
              <Text variant="body" weight="heavy">
                {totalDest}
              </Text>
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
                {visitCards.map((c, idx) => {
                  const field = getField(c.fieldId);
                  return (
                    <ReviewVisitCard
                      key={c.visit.id}
                      visit={c.visit}
                      order={c.displayOrder}
                      fieldId={c.fieldId}
                      fieldAddress={field?.address ?? '알 수 없는 현장'}
                      fieldAddressDetail={field?.addressDetail || undefined}
                      initiallyExpanded={idx === 0}
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
                {skippedDestinations.map((d) => {
                  const field = getField(d.fieldId);
                  return (
                    <Card key={d.id} padding="md" style={styles.skippedCard}>
                      <View style={styles.skippedHead}>
                        <View style={styles.skippedOrderBadge}>
                          <Text variant="caption" weight="bold" color="textMuted">
                            {d.order}
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
        <View style={styles.ctaRow}>
          <Button
            onPress={() => router.replace('/(tabs)/trips' as never)}
            variant="ghost"
            size="lg"
            style={styles.ctaFlex}
          >
            나중에
          </Button>
          <Button
            onPress={() =>
              router.replace(`/(tabs)/reports/new?tripId=${id}` as never)
            }
            size="lg"
            leftIcon="document-text"
            style={styles.ctaFlex}
          >
            보고서 작성
          </Button>
        </View>
      </StickyBottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm },
  ctaFlex: { flex: 1 },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statRow: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
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
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skippedBody: { flex: 1 },
});

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Redirect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { spacing } from '@/theme/spacing';
import { fmtDate, fmtDuration, fmtTime } from '@/utils/datetime';
import type { Trip } from '@/types/entities';

export default function TripsList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allTrips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const allVisits = useVisitStore((s) => s.visits);

  const trips = useMemo(
    () =>
      userId
        ? allTrips
            .filter((t) => t.workerId === userId)
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [],
    [allTrips, userId],
  );

  // tripId → visit 카운트 Map — renderItem 의 per-row .filter (O(N×M)) 제거.
  // allVisits 가 바뀔 때만 재계산.
  const visitCountByTrip = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of allVisits) m.set(v.tripId, (m.get(v.tripId) ?? 0) + 1);
    return m;
  }, [allVisits]);

  // 진행 중인 외근이 있으면 외근 탭은 그 외근의 방문 현장 화면(active)으로 직행.
  // 사용자가 외근 탭을 누를 때 "지금 무슨 현장 가는 거였지" 즉시 확인할 수 있도록.
  if (activeTripId !== null) {
    return <Redirect href="/(tabs)/trips/active" />;
  }

  // 라인 46 의 <Redirect/> 로 activeTripId 있으면 이 화면에 도달 못함 →
  // 'isActive Badge' 분기는 영구 dead. 진행 중 외근은 외근 탭 진입 시 active 화면이 직행으로 받음.
  const renderItem = ({ item }: { item: Trip }) => {
    const visitCount = visitCountByTrip.get(item.id) ?? 0;
    const dateText = fmtDate(item.startedAt);
    const startTime = fmtTime(item.startedAt);
    return (
      <Card
        onPress={() => router.push(`/(tabs)/trips/${item.id}` as never)}
        style={styles.cardSpacing}
      >
        <Text variant="body" weight="bold">
          {item.title || dateText}
        </Text>
        <Text variant="bodySm" color="textMuted" style={styles.meta}>
          {/* 시작 시각 노출 — 한 날에 외근 2번 이상이면 제목 없이는 구분 불가 회로 차단. */}
          {item.title ? `${dateText} ${startTime}` : startTime} ·{' '}
          {fmtDuration(item.startedAt, item.endedAt)} · 방문 {visitCount}건
        </Text>
      </Card>
    );
  };

  return (
    <View style={styles.screenRoot}>
      {/* 외근 탭 루트엔 "선택된 외근" 개념이 없음 — 지도에 내 현장 전체를 까는 대신 빈 마커.
          전체 현장 탐색은 '현장' 탭에서, 그 외근의 현장은 카드 탭 → 외근 상세에서 노출. */}
      <MapSheetLayout title="외근 내역" mapFieldIds={[]}>
        <BottomSheetFlatList
          data={trips}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title="외근 기록이 없습니다"
              description="아래 버튼을 눌러 첫 외근을 시작하세요"
            />
          }
        />
      </MapSheetLayout>
      {/* StickyBottomBar 는 BottomSheet 외부에 둔다 (active.tsx / [id].tsx 와 동일 패턴) — 시트 내부 absolute 자식이 pan 제스처에 가려져 탭 진입 시 안 보이던 회로 차단. */}
      <StickyBottomBar>
        <Button
          onPress={() => router.push('/(tabs)/trips/new/select' as never)}
          size="lg"
          fullWidth
          leftIcon="play-circle"
        >
          외근 시작
        </Button>
      </StickyBottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: 120 },
  cardSpacing: { marginBottom: spacing.sm },
  meta: { marginTop: spacing.xs },
});

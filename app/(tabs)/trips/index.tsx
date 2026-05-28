import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Redirect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { fmtDate, fmtDuration } from '@/utils/datetime';
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

  // 진행 중인 외근이 있으면 외근 탭은 그 외근의 방문 현장 화면(active)으로 직행.
  // 사용자가 외근 탭을 누를 때 "지금 무슨 현장 가는 거였지" 즉시 확인할 수 있도록.
  if (activeTripId !== null) {
    return <Redirect href="/(tabs)/trips/active" />;
  }

  // 라인 46 의 <Redirect/> 로 activeTripId 있으면 이 화면에 도달 못함 →
  // 'isActive Badge' 분기는 영구 dead. 진행 중 외근은 외근 탭 진입 시 active 화면이 직행으로 받음.
  const renderItem = ({ item }: { item: Trip }) => {
    const visitCount = allVisits.filter((v) => v.tripId === item.id).length;
    const dateText = fmtDate(item.startedAt);
    return (
      <Card
        onPress={() => router.push(`/(tabs)/trips/${item.id}` as never)}
        style={styles.cardSpacing}
      >
        <Text style={styles.title}>{item.title || dateText}</Text>
        <Text style={styles.meta}>
          {item.title ? `${dateText} · ` : ''}
          {fmtDuration(item.startedAt, item.endedAt)} · 방문 {visitCount}건
        </Text>
      </Card>
    );
  };

  return (
    <MapSheetLayout title="외근 내역">
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
      <View style={styles.ctaWrap}>
        <Button
          onPress={() => router.push('/(tabs)/trips/new/select' as never)}
          size="lg"
          fullWidth
          leftIcon="play-circle"
        >
          외근 시작
        </Button>
      </View>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 120 },
  cardSpacing: { marginBottom: spacing.sm },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    lineHeight: lineHeight.base,
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: lineHeight.sm,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
  },
});

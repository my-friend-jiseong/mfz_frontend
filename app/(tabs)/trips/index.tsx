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
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import type { Trip } from '@/types/entities';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDuration(a: string, b: string | null) {
  if (!b) return '진행 중';
  const diff = new Date(b).getTime() - new Date(a).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

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

  const renderItem = ({ item }: { item: Trip }) => {
    const visitCount = allVisits.filter((v) => v.tripId === item.id).length;
    const isActive = item.id === activeTripId;
    const dateText = fmtDate(item.startedAt);
    return (
      <Card
        onPress={() => router.push(`/(tabs)/trips/${item.id}` as never)}
        style={styles.cardSpacing}
      >
        <View style={styles.row}>
          <Text style={styles.title}>{item.title || dateText}</Text>
          {isActive ? <Badge tone="danger" shape="circle" label="진행 중" /> : null}
        </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
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

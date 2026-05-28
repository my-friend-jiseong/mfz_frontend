import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { nearestNeighborOrder } from '@/utils/routeOptimize';
import { trips as tripsApi } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

interface OrderedField {
  id: string;
  address: string;
  addressDetail: string;
  lat: number;
  lng: number;
  // 추천 적용 시 채워짐 — 추천 미사용 시 undefined
  distanceFromPrevKm?: number;
  etaMinutes?: number;
}

export default function NewTripOrder() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fieldIds?: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const getField = useFieldStore((s) => s.getById);
  const startTrip = useTripStore((s) => s.start);
  const bulkCreate = useDestinationStore((s) => s.bulkCreate);

  const initialList = useMemo<OrderedField[]>(() => {
    const ids = (params.fieldIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return ids
      .map((id) => getField(id))
      .filter((f): f is NonNullable<ReturnType<typeof getField>> => Boolean(f))
      .map((f) => ({
        id: f.id,
        address: f.address,
        addressDetail: f.addressDetail,
        lat: f.latitude,
        lng: f.longitude,
      }));
  }, [params.fieldIds, getField]);

  const [list, setList] = useState<OrderedField[]>(initialList);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [optimized, setOptimized] = useState(false);

  // 동선 최적화 — handoff §9b 의 신규 pre-trip endpoint 우선, 실패 시 클라이언트
  // nearest neighbor 폴백. 출발지는 list[0] 좌표 (현재 위치 권한 없이 동작).
  const handleOptimize = async () => {
    if (list.length < 2) {
      Alert.alert('최적 순서 추천', '최소 2개 이상의 현장이 필요합니다.');
      return;
    }
    const valid = list.filter((f) => f.lat !== 0 || f.lng !== 0);
    if (valid.length < list.length) {
      Alert.alert(
        '좌표 누락',
        '일부 현장에 좌표가 없어 추천 결과가 부정확할 수 있습니다.',
      );
    }
    const start = { lat: list[0].lat, lng: list[0].lng };
    let ordered: OrderedField[];
    let totalKm: number;
    let totalEta: number;
    try {
      const res = await tripsApi.optimizePreview({
        startLat: start.lat,
        startLng: start.lng,
        fields: list.map((f) => ({
          fieldId: f.id,
          name: f.address,
          lat: f.lat,
          lng: f.lng,
        })),
      });
      const byId = new Map(list.map((f) => [f.id, f]));
      const mapped: OrderedField[] = [];
      for (const o of res.optimizedOrder) {
        const base = byId.get(o.fieldId);
        if (!base) continue;
        mapped.push({
          ...base,
          distanceFromPrevKm: o.distanceFromPrevKm,
          etaMinutes: o.etaMinutes,
        });
      }
      ordered = mapped;
      totalKm = res.summary.totalDistanceKm;
      totalEta = res.summary.totalEtaMinutes;
    } catch {
      ordered = nearestNeighborOrder(start, list);
      totalKm = ordered.reduce((a, x) => a + (x.distanceFromPrevKm ?? 0), 0);
      totalEta = ordered.reduce((a, x) => a + (x.etaMinutes ?? 0), 0);
    }
    setList(ordered);
    setOptimized(true);
    Alert.alert(
      '최적 순서 적용됨',
      `총 ${totalKm.toFixed(1)}km · 예상 ${totalEta}분\n\n수동으로 더 조정하셔도 됩니다.`,
    );
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    setList((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setOptimized(false);
  };

  const moveDown = (idx: number) => {
    setList((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setOptimized(false);
  };

  const removeAt = (idx: number) => {
    setList((prev) => prev.filter((_, i) => i !== idx));
    setOptimized(false);
  };

  const totalDistanceKm = optimized
    ? list.reduce((a, x) => a + (x.distanceFromPrevKm ?? 0), 0)
    : null;
  const totalEtaMin = optimized
    ? list.reduce((a, x) => a + (x.etaMinutes ?? 0), 0)
    : null;

  const handleConfirm = async () => {
    if (!userId || list.length === 0 || submitting) return;
    setSubmitting(true);
    const r = await startTrip(title);
    setSubmitting(false);
    if (!r.ok) {
      Alert.alert('외근 시작 실패', r.error);
      return;
    }
    bulkCreate(
      r.trip.id,
      list.map((f) => f.id),
    );
    router.replace('/(tabs)/trips/active' as never);
  };

  if (list.length === 0) {
    return (
      <MapSheetLayout title="방문 순서 확인" onBack={() => safeBack(router)}>
        <EmptyState
          icon="alert-circle-outline"
          title="선택된 현장이 없습니다"
          description="이전 화면으로 돌아가 현장을 선택해주세요"
        />
      </MapSheetLayout>
    );
  }

  const renderItem = ({
    item,
    index,
  }: {
    item: OrderedField;
    index: number;
  }) => (
    <View style={styles.row}>
      <View style={styles.orderBadge}>
        <Text variant="bodySm" weight="bold" color="onPrimary">
          {index + 1}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text variant="body" weight="semibold">
          {item.address}
        </Text>
        {item.addressDetail ? (
          <Text variant="bodySm" color="textMuted" style={styles.detail}>
            {item.addressDetail}
          </Text>
        ) : null}
        {optimized && item.distanceFromPrevKm !== undefined ? (
          <Text
            variant="caption"
            weight="semibold"
            color="primary"
            style={styles.eta}
          >
            {index === 0
              ? '출발지 인근'
              : `+${item.distanceFromPrevKm}km · ${item.etaMinutes}분`}
          </Text>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={() => moveUp(index)}
          disabled={index === 0}
          accessibilityLabel="위로 이동"
          style={({ pressed }) => [
            styles.ctrlBtn,
            index === 0 && styles.ctrlDisabled,
            pressed && { opacity: opacity.pressed },
          ]}
        >
          <Ionicons name="chevron-up" size={14} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => moveDown(index)}
          disabled={index === list.length - 1}
          accessibilityLabel="아래로 이동"
          style={({ pressed }) => [
            styles.ctrlBtn,
            index === list.length - 1 && styles.ctrlDisabled,
            pressed && { opacity: opacity.pressed },
          ]}
        >
          <Ionicons name="chevron-down" size={14} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() =>
            Alert.alert(
              '이 현장 빼기',
              `${item.address} 를 외근에서 제외할까요?`,
              [
                { text: '취소', style: 'cancel' },
                { text: '빼기', style: 'destructive', onPress: () => removeAt(index) },
              ],
            )
          }
          accessibilityLabel="제외"
          style={({ pressed }) => [
            styles.ctrlBtn,
            styles.ctrlDanger,
            pressed && { opacity: opacity.pressed },
          ]}
        >
          <Ionicons name="close" size={16} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <MapSheetLayout
      title="방문 순서 확인"
      onBack={() => safeBack(router)}
      mapFieldIds={list.map((f) => f.id)}
    >
      <View style={styles.head}>
        <Input
          label="외근 제목 (선택)"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 가로수 보수 공사, 동구 일상 점검"
          maxLength={50}
          containerStyle={styles.titleField}
        />
        <Text variant="body" weight="semibold">
          위에서부터 순서대로 방문합니다
        </Text>
        <Text variant="bodySm" color="textMuted" style={{ marginTop: 2 }}>
          상하 화살표로 순서, × 로 제외할 수 있습니다
        </Text>
        <Button
          onPress={() => void handleOptimize()}
          variant="secondary"
          size="sm"
          leftIcon={optimized ? 'checkmark-circle' : 'sparkles'}
          style={[styles.optimizeBtn, optimized && styles.optimizeBtnActive]}
        >
          {optimized ? '최적 순서 적용됨 · 다시 추천' : '최적 순서 추천'}
        </Button>
        {totalDistanceKm !== null && totalEtaMin !== null ? (
          <Card padding="md" style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text variant="caption" weight="semibold" color="textMuted">
                총 거리
              </Text>
              <Text variant="body" weight="bold" style={styles.summaryValue}>
                {totalDistanceKm.toFixed(1)} km
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text variant="caption" weight="semibold" color="textMuted">
                예상 ETA
              </Text>
              <Text variant="body" weight="bold" style={styles.summaryValue}>
                {totalEtaMin}분
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text variant="caption" weight="semibold" color="textMuted">
                방문 현장
              </Text>
              <Text variant="body" weight="bold" style={styles.summaryValue}>
                {list.length}곳
              </Text>
            </View>
          </Card>
        ) : null}
      </View>
      <BottomSheetFlatList
        data={list}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <StickyBottomBar>
        <Button
          onPress={handleConfirm}
          disabled={list.length === 0}
          loading={submitting}
          size="lg"
          fullWidth
          leftIcon="play-circle"
        >
          {list.length === 0
            ? '방문할 현장 없음'
            : `외근 시작 확정 (${list.length}곳)`}
        </Button>
      </StickyBottomBar>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  titleField: { marginBottom: spacing.md },
  optimizeBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  optimizeBtnActive: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  detail: { marginTop: 2 },
  eta: { marginTop: 4 },
  controls: { gap: 4 },
  ctrlBtn: {
    width: 32,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlDisabled: { opacity: opacity.disabled },
  ctrlDanger: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerMuted,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.border },
});

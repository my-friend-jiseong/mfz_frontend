import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { nearestNeighborOrder } from '@/utils/routeOptimize';
import { trips as tripsApi } from '@/api';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

interface OrderedField {
  id: string;
  title?: string;
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
        title: f.title,
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
      '✨ 최적 순서 적용됨',
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
    setOptimized(false); // 수동 조정 시 추천 라벨 해제
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

  // 추천 적용된 결과의 총 거리·ETA — 수동 조정 시에도 직전 추천 값으로 표시
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
      <MapSheetLayout title="방문 순서 확인" onBack={() => router.back()}>
        <EmptyState
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
        <Text style={styles.orderText}>{index + 1}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.address}>{item.title || item.address}</Text>
        {item.title ? (
          <Text style={styles.detail}>{item.address}</Text>
        ) : null}
        {item.addressDetail ? (
          <Text style={styles.detail}>{item.addressDetail}</Text>
        ) : null}
        {optimized && item.distanceFromPrevKm !== undefined ? (
          <Text style={styles.eta}>
            {index === 0 ? '출발지 인근' : `+${item.distanceFromPrevKm}km · ${item.etaMinutes}분`}
          </Text>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          onPress={() => moveUp(index)}
          disabled={index === 0}
          style={({ pressed }) => [
            styles.ctrlBtn,
            index === 0 && styles.ctrlDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.ctrlText}>▲</Text>
        </Pressable>
        <Pressable
          onPress={() => moveDown(index)}
          disabled={index === list.length - 1}
          style={({ pressed }) => [
            styles.ctrlBtn,
            index === list.length - 1 && styles.ctrlDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.ctrlText}>▼</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            Alert.alert(
              '이 현장 빼기',
              `${item.title || item.address} 를 외근에서 제외할까요?`,
              [
                { text: '취소', style: 'cancel' },
                { text: '빼기', style: 'destructive', onPress: () => removeAt(index) },
              ],
            )
          }
          style={({ pressed }) => [styles.ctrlBtn, styles.ctrlDanger, pressed && styles.pressed]}
        >
          <Text style={styles.ctrlDangerText}>×</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <MapSheetLayout title="방문 순서 확인" onBack={() => router.back()}>
      <View style={styles.head}>
        <Text style={styles.titleLabel}>외근 제목 (선택)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.titleInput}
          placeholder="예: 가로수 보수 공사, 동구 일상 점검"
          maxLength={50}
        />
        <Text style={styles.headTitle}>위에서부터 순서대로 방문합니다</Text>
        <Text style={styles.headMeta}>▲▼ 로 순서, × 로 제외할 수 있습니다</Text>
        <Pressable
          onPress={() => void handleOptimize()}
          style={({ pressed }) => [
            styles.optimizeBtn,
            optimized && styles.optimizeBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.optimizeText,
              optimized && styles.optimizeTextActive,
            ]}
          >
            {optimized ? '✓ 최적 순서 적용됨 · 다시 추천' : '✨ 최적 순서 추천'}
          </Text>
        </Pressable>
        {totalDistanceKm !== null && totalEtaMin !== null ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>총 거리</Text>
              <Text style={styles.summaryValue}>{totalDistanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>예상 ETA</Text>
              <Text style={styles.summaryValue}>{totalEtaMin}분</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>방문 현장</Text>
              <Text style={styles.summaryValue}>{list.length}곳</Text>
            </View>
          </View>
        ) : null}
      </View>
      <BottomSheetFlatList
        data={list}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <Pressable
        onPress={handleConfirm}
        disabled={submitting || list.length === 0}
        style={({ pressed }) => [
          styles.fab,
          (submitting || list.length === 0) && styles.fabDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.fabText}>
          {submitting
            ? '외근 시작 중...'
            : list.length === 0
              ? '방문할 현장 없음'
              : `외근 시작 확정 (${list.length}곳)`}
        </Text>
      </Pressable>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headTitle: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  headMeta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  titleLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.text,
    marginBottom: spacing.md,
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
  orderText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  rowText: { flex: 1 },
  address: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  detail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  eta: { fontSize: fontSize.xs, color: colors.primary, marginTop: 4, fontWeight: '600' },
  optimizeBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
    alignSelf: 'flex-start',
  },
  optimizeBtnActive: {
    backgroundColor: colors.success + '15',
    borderColor: colors.success,
  },
  optimizeText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
  optimizeTextActive: { color: colors.success },
  controls: { gap: 4 },
  ctrlBtn: {
    width: 32,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlDisabled: { opacity: 0.35 },
  ctrlText: { fontSize: 12, color: colors.text, fontWeight: '700' },
  ctrlDanger: { borderColor: colors.danger + '55', backgroundColor: colors.danger + '08' },
  ctrlDangerText: { fontSize: 16, color: colors.danger, fontWeight: '700' },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success + '40',
    backgroundColor: colors.success + '0a',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  summaryValue: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.border },
  pressed: { opacity: 0.7 },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  fabDisabled: { backgroundColor: colors.border },
  fabText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});

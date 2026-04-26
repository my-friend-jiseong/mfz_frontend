import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

interface OrderedField {
  id: string;
  address: string;
  addressDetail: string;
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
      }));
  }, [params.fieldIds, getField]);

  const [list, setList] = useState<OrderedField[]>(initialList);
  const [submitting, setSubmitting] = useState(false);

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    setList((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setList((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!userId || list.length === 0 || submitting) return;
    setSubmitting(true);
    const r = await startTrip();
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
        <Text style={styles.address}>{item.address}</Text>
        {item.addressDetail ? (
          <Text style={styles.detail}>{item.addressDetail}</Text>
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
      </View>
    </View>
  );

  return (
    <MapSheetLayout title="방문 순서 확인" onBack={() => router.back()}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>위에서부터 순서대로 방문합니다</Text>
        <Text style={styles.headMeta}>▲▼ 버튼으로 순서를 조정하세요</Text>
      </View>
      <BottomSheetFlatList
        data={list}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
      <Pressable
        onPress={handleConfirm}
        disabled={submitting}
        style={({ pressed }) => [
          styles.fab,
          submitting && styles.fabDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.fabText}>
          {submitting ? '외근 시작 중...' : `외근 시작 확정 (${list.length}곳)`}
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

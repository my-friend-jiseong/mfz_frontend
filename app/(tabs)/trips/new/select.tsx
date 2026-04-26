import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Field } from '@/types/entities';

export default function NewTripSelect() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const activeTripId = useTripStore((s) => s.activeTripId);

  const fields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggle = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleNext = () => {
    if (selectedIds.length === 0) return;
    router.push({
      pathname: '/(tabs)/trips/new/order',
      params: { fieldIds: selectedIds.join(',') },
    } as never);
  };

  if (activeTripId !== null) {
    return (
      <MapSheetLayout title="외근 시작" onBack={() => router.back()}>
        <EmptyState
          title="이미 진행 중인 외근이 있습니다"
          description="현재 외근을 종료한 뒤 새 외근을 시작해주세요"
        />
      </MapSheetLayout>
    );
  }

  const renderItem = ({ item }: { item: Field }) => {
    const checked = selectedIds.includes(item.id);
    return (
      <Pressable
        onPress={() => toggle(item.id)}
        style={({ pressed }) => [
          styles.row,
          checked && styles.rowChecked,
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[styles.checkbox, checked && styles.checkboxChecked]}
        >
          {checked ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.address}>{item.address}</Text>
          {item.addressDetail ? (
            <Text style={styles.detail}>{item.addressDetail}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <MapSheetLayout title="방문할 현장 선택" onBack={() => router.back()}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>오늘 방문할 현장을 모두 선택하세요</Text>
        <Text style={styles.headMeta}>{selectedIds.length}개 선택됨</Text>
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="담당 현장이 없습니다"
            description="현장 탭에서 새 현장을 등록하세요"
          />
        }
      />
      <Pressable
        onPress={handleNext}
        disabled={selectedIds.length === 0}
        style={({ pressed }) => [
          styles.fab,
          selectedIds.length === 0 && styles.fabDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.fabText}>
          다음 ({selectedIds.length})
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
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  rowChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  pressed: { opacity: 0.7 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rowText: { flex: 1 },
  address: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  detail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
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

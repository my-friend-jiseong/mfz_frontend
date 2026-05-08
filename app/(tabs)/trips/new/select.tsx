import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { FIELD_STATUS_VALUES, type Field, type FieldStatus } from '@/types/entities';

const STATUS_LABEL: Record<FieldStatus, string> = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
};

export default function NewTripSelect() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const activeTripId = useTripStore((s) => s.activeTripId);

  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FieldStatus[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fields = useMemo(() => {
    let list = myFields;
    if (statusFilter.length > 0) {
      list = list.filter((f) => statusFilter.includes(f.status));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.address.toLowerCase().includes(q) ||
          (f.addressDetail ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [myFields, statusFilter, search]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleStatus = (s: FieldStatus) =>
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  // 현재 보이는 (필터링된) 현장이 모두 선택됐는지 — 전체 선택 토글 상태
  const visibleAllSelected =
    fields.length > 0 && fields.every((f) => selectedIds.includes(f.id));
  const toggleSelectAll = () => {
    const visibleIds = fields.map((f) => f.id);
    if (visibleAllSelected) {
      // 보이는 현장만 선택 해제
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

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
          <Text style={styles.address}>{item.title || item.address}</Text>
          {item.title ? (
            <Text style={styles.detail}>{item.address}</Text>
          ) : null}
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
        <View style={styles.headRow}>
          <Text style={styles.headTitle}>방문할 현장 선택</Text>
          <Text style={styles.headMeta}>
            {selectedIds.length}/{myFields.length}개
          </Text>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="주소·상세주소 검색"
          style={styles.searchInput}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <View style={styles.chipRow}>
          {FIELD_STATUS_VALUES.map((s) => {
            const active = statusFilter.includes(s);
            const c = colors.fieldStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => toggleStatus(s)}
                style={[
                  styles.chip,
                  active && { backgroundColor: c + '22', borderColor: c },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && { color: c, fontWeight: '700' },
                  ]}
                >
                  {STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
          {fields.length > 0 ? (
            <Pressable onPress={toggleSelectAll} style={styles.chip}>
              <Text style={styles.chipText}>
                {visibleAllSelected ? '모두 해제' : '모두 선택'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title={
              search || statusFilter.length > 0
                ? '검색 결과가 없습니다'
                : '담당 현장이 없습니다'
            }
            description={
              search || statusFilter.length > 0
                ? '검색어 또는 필터를 조정해보세요'
                : '현장 탭에서 새 현장을 등록하세요'
            }
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
    gap: spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headTitle: { fontSize: fontSize.base, color: colors.text, fontWeight: '700' },
  headMeta: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  chipRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted },
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

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { safeBack } from '@/utils/backNavigation';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { FilterChip } from '@/components/ui/FilterChip';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import {
  FIELD_STATUS_VALUES,
  FIELD_STATUS_LABEL,
  type Field,
  type FieldStatus,
} from '@/types/entities';

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
      <MapSheetLayout title="외근 시작" onBack={() => safeBack(router)}>
        <EmptyState
          icon="briefcase"
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
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={({ pressed }) => [
          styles.row,
          checked && styles.rowChecked,
          pressed && { opacity: opacity.pressed },
        ]}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={checked ? colors.primary : colors.textMuted}
        />
        <View style={styles.rowText}>
          <Text variant="body" weight="semibold">
            {item.address}
          </Text>
          {item.addressDetail ? (
            <Text variant="bodySm" color="textMuted" style={styles.detail}>
              {item.addressDetail}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <MapSheetLayout title="방문할 현장 선택" onBack={() => safeBack(router)}>
      <View style={styles.head}>
        <View style={styles.headRow}>
          <Text variant="body" weight="bold">
            방문할 현장 선택
          </Text>
          <Text variant="bodySm" weight="bold" color="primary">
            {selectedIds.length}/{myFields.length}개
          </Text>
        </View>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="주소·상세주소 검색"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          leftSlot={<Ionicons name="search" size={18} color={colors.textMuted} />}
        />
        <View style={styles.chipRow}>
          {FIELD_STATUS_VALUES.map((s) => (
            <FilterChip
              key={s}
              label={FIELD_STATUS_LABEL[s]}
              active={statusFilter.includes(s)}
              activeColor={colors.fieldStatus[s]}
              onPress={() => toggleStatus(s)}
            />
          ))}
          {fields.length > 0 ? (
            <FilterChip
              label={visibleAllSelected ? '모두 해제' : '모두 선택'}
              active={false}
              dashed
              leftIcon={
                visibleAllSelected ? 'remove-circle-outline' : 'checkbox-outline'
              }
              onPress={toggleSelectAll}
            />
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
            icon={search || statusFilter.length > 0 ? 'search-outline' : 'location-outline'}
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
      <StickyBottomBar>
        <Button
          onPress={handleNext}
          disabled={selectedIds.length === 0}
          size="lg"
          fullWidth
          rightIcon="arrow-forward"
        >
          다음 ({selectedIds.length})
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
    gap: spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
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
    backgroundColor: colors.primaryMuted,
  },
  rowText: { flex: 1 },
  detail: { marginTop: 2 },
});

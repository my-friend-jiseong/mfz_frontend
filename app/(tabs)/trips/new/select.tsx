import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
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
import { collectFieldFacets, applyFieldFilters, mergeCategoryNames } from '@/utils/fieldFacets';
import { useCategoryStore } from '@/stores/categoryStore';

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
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { projects: availableProjects, categories: facetCategories } = useMemo(
    () => collectFieldFacets(myFields),
    [myFields],
  );
  const masterCategories = useCategoryStore((s) => s.categories);
  const availableCategories = useMemo(
    () => mergeCategoryNames(masterCategories.map((c) => c.name), facetCategories),
    [masterCategories, facetCategories],
  );

  const fields = useMemo(
    () =>
      applyFieldFilters(myFields, {
        search,
        statuses: statusFilter,
        projectIds: projectFilter,
        categories: categoryFilter,
      }),
    [myFields, statusFilter, projectFilter, categoryFilter, search],
  );

  // 선택된 현장 요약 — id → field (주소) lookup. 해제 chip 의 X 클릭으로 즉시 토글.
  // hooks 는 early return (activeTripId !== null 분기) 위에 모아둔다 — order/active 화면에서
  // tripStore 가 startTrip 으로 activeTripId 를 채우면 stack 에 남아있던 select 가 함께
  // re-render 되는데, 이 두 useMemo 가 early return 아래에 있으면 hook 카운트가 줄어
  // React #300 "Rendered fewer hooks than expected" 로 root 가 죽는다.
  const fieldById = useMemo(() => {
    const m = new Map<string, Field>();
    for (const f of myFields) m.set(f.id, f);
    return m;
  }, [myFields]);
  const selectedFields = useMemo(
    () => selectedIds.map((id) => fieldById.get(id)).filter((f): f is Field => !!f),
    [selectedIds, fieldById],
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleStatus = (s: FieldStatus) =>
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  const toggleProject = (id: string) =>
    setProjectFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleCategory = (c: string) =>
    setCategoryFilter((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
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
          action={
            <Button
              onPress={() => router.replace('/(tabs)/trips/active' as never)}
              leftIcon="navigate"
            >
              진행 중 외근 보기
            </Button>
          }
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
    <MapSheetLayout
      title="방문할 현장 선택"
      onBack={() => safeBack(router)}
      // 진입 시 시트를 55%(index 1)로 — 위 절반에 지도가 보여 마커 탭으로 바로 선택 가능.
      initialIndex={1}
      // 배경 지도 마커 탭 → 리스트와 동일한 toggle 로 선택 동기화.
      selectedFieldIds={selectedIds}
      onSelectField={toggle}
    >
      <View style={styles.head}>
        <View style={styles.headRow}>
          <Text variant="body" weight="bold">
            방문할 현장 선택
          </Text>
          <Text variant="bodySm" weight="bold" color="primary">
            {selectedIds.length}/{myFields.length}개
          </Text>
        </View>
        {selectedFields.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedRow}
          >
            {selectedFields.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => toggle(f.id)}
                accessibilityRole="button"
                accessibilityLabel={`${f.address} 선택 해제`}
                style={({ pressed }) => [
                  styles.selectedChip,
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Text
                  variant="caption"
                  weight="bold"
                  color="primary"
                  numberOfLines={1}
                  style={styles.selectedChipLabel}
                >
                  {f.address}
                </Text>
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="주소·프로젝트·분류 검색"
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
        {availableProjects.length > 0 ? (
          <View style={styles.chipRow}>
            {availableProjects.map((p) => (
              <FilterChip
                key={p.id}
                label={p.name}
                active={projectFilter.includes(p.id)}
                leftIcon="folder-outline"
                onPress={() => toggleProject(p.id)}
              />
            ))}
          </View>
        ) : null}
        {availableCategories.length > 0 ? (
          <View style={styles.chipRow}>
            {availableCategories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={categoryFilter.includes(c)}
                leftIcon="pricetag-outline"
                onPress={() => toggleCategory(c)}
              />
            ))}
          </View>
        ) : null}
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        style={sheetScrollableStyle}
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
                : '아래 버튼으로 첫 현장을 등록하세요'
            }
            action={
              !search && statusFilter.length === 0 ? (
                <Button
                  onPress={() => router.push('/(tabs)/fields/new' as never)}
                  leftIcon="add-circle"
                >
                  새 현장 등록
                </Button>
              ) : undefined
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
  selectedRow: { gap: spacing.xs, paddingVertical: 2 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
    maxWidth: 200,
  },
  selectedChipLabel: { flexShrink: 1 },
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

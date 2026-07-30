import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { listBottomInset, radius, spacing } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { FilterChip } from '@/components/ui/FilterChip';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { FieldCard } from '@/components/FieldCard';
import { FieldFilterBar } from '@/components/fields/FieldFilterBar';
import { type Field, type FieldStatus } from '@/types/entities';
import { collectFieldFacets, applyFieldFilters, mergeCategoryNames } from '@/utils/fieldFacets';
import { useCategoryStore } from '@/stores/categoryStore';
import { TRIP_MAX_PLANNED_FIELDS } from '@/api';

export default function NewTripSelect() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const activeTripId = useTripStore((s) => s.activeTripId);

  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  // 필터는 현장 목록 탭과 동일하게 그룹당 단일 선택 — 같은 FieldFilterBar 를 재사용해
  // 두 화면의 조작법을 하나로 통일한다(이전엔 여기만 다중선택 칩 3줄이었음).
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
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
        statuses: status ? [status] : undefined,
        projectIds: projectId ? [projectId] : undefined,
        categories: category ? [category] : undefined,
      }),
    [myFields, status, projectId, category, search],
  );

  const hasFilter = status !== null || projectId !== null || category !== null;

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

  // 백엔드 plannedFields 상한(200). 여기서 막지 않으면 현장을 다 고르고 순서까지 정한 뒤
  // 마지막 '외근 시작' 에서 400 으로 튕긴다 — 되돌릴 방법도 안내도 없는 막다른 길이었다.
  const atLimit = selectedIds.length >= TRIP_MAX_PLANNED_FIELDS;

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= TRIP_MAX_PLANNED_FIELDS) {
        // 해제는 언제나 되고 추가만 막는다 — 상한에 걸렸을 때 목록이 굳어버리지 않게.
        Alert.alert(
          '한 번에 최대 ' + TRIP_MAX_PLANNED_FIELDS + '곳',
          '외근 하나에 담을 수 있는 현장은 ' +
            TRIP_MAX_PLANNED_FIELDS +
            '곳까지입니다. 일부를 해제한 뒤 다시 선택해주세요.',
        );
        return prev;
      }
      return [...prev, id];
    });

  // 현재 보이는 (필터링된) 현장이 모두 선택됐는지 — 전체 선택 토글 상태
  const visibleAllSelected =
    fields.length > 0 && fields.every((f) => selectedIds.includes(f.id));
  const toggleSelectAll = () => {
    const visibleIds = fields.map((f) => f.id);
    if (visibleAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => {
      const merged = Array.from(new Set([...prev, ...visibleIds]));
      if (merged.length <= TRIP_MAX_PLANNED_FIELDS) return merged;
      // 상한까지만 담는다. 조용히 잘라내면 사용자는 전부 선택된 줄 안다.
      const dropped = merged.length - TRIP_MAX_PLANNED_FIELDS;
      Alert.alert(
        '한 번에 최대 ' + TRIP_MAX_PLANNED_FIELDS + '곳',
        '선택한 현장이 상한을 넘어 앞에서부터 ' +
          TRIP_MAX_PLANNED_FIELDS +
          '곳만 담았습니다. (' +
          dropped +
          '곳 제외)',
      );
      return merged.slice(0, TRIP_MAX_PLANNED_FIELDS);
    });
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

  // 현장 목록 탭과 같은 카드 — 상태·프로젝트·분류를 보고 고를 수 있게 한다.
  // (이전엔 주소만 나와 "어떤 현장이었지" 를 기억에 의존해야 했음)
  const renderItem = ({ item }: { item: Field }) => (
    <FieldCard
      field={item}
      selected={selectedIds.includes(item.id)}
      showCheckbox
      onPress={() => toggle(item.id)}
    />
  );

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
          <Text
            variant="bodySm"
            weight="bold"
            color={atLimit ? 'danger' : 'primary'}
          >
            {selectedIds.length}/{myFields.length}개 선택
            {/* 상한에 닿았을 때만 알린다 — 평소엔 200 이라는 숫자가 의미 없는 노이즈다. */}
            {atLimit ? ` · 최대 ${TRIP_MAX_PLANNED_FIELDS}곳` : ''}
          </Text>
          {/* '모두 선택' 은 필터 칩이 아니라 선택 동작 — 필터 바에서 분리해 카운트 옆에 둔다. */}
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
        {/* 방문일 그룹은 숨김 — 이 화면은 클라이언트 필터(applyFieldFilters)만 쓰므로
            기간 조건이 동작하지 않는다. */}
        <FieldFilterBar
          status={status}
          onStatus={setStatus}
          projects={availableProjects}
          projectId={projectId}
          onProject={setProjectId}
          categories={availableCategories}
          category={category}
          onCategory={setCategory}
          fromDate={null}
          toDate={null}
          onDateRange={() => {}}
          onResetAll={() => {
            setStatus(null);
            setProjectId(null);
            setCategory(null);
          }}
          hasFilter={hasFilter}
          showDate={false}
        />
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        style={sheetScrollableStyle}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon={search || hasFilter ? 'search-outline' : 'location-outline'}
            title={
              search || hasFilter ? '검색 결과가 없습니다' : '담당 현장이 없습니다'
            }
            description={
              search || hasFilter
                ? '검색어 또는 필터를 조정해보세요'
                : '아래 버튼으로 첫 현장을 등록하세요'
            }
            action={
              !search && !hasFilter ? (
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
  list: { paddingHorizontal: spacing.lg, paddingBottom: listBottomInset },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { FieldCard } from '@/components/FieldCard';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { FilterChip } from '@/components/ui/FilterChip';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { useHideOnScroll } from '@/components/ui/useHideOnScroll';
import {
  FIELD_STATUS_VALUES,
  FIELD_STATUS_LABEL,
  type FieldStatus,
} from '@/types/entities';
import { collectFieldFacets, applyFieldFilters } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// 노션 "데이터 필터" — 기간 프리셋 (시작일·종료일 직접 입력은 후속).
// 'default_30d' 는 백엔드 기본값(visit 기준 최근 30일).
type RangePreset = 'default_30d' | '7d' | '1d' | 'all';
const RANGE_LABEL: Record<RangePreset, string> = {
  default_30d: '최근 30일',
  '7d': '최근 7일',
  '1d': '오늘',
  all: '전체',
};
const RANGE_ORDER: RangePreset[] = ['all', '1d', '7d', 'default_30d'];

function rangeToParams(preset: RangePreset): {
  visitDateScope?: 'all' | 'none';
  fromDate?: string;
  toDate?: string;
} {
  if (preset === 'all') return { visitDateScope: 'all' };
  if (preset === 'default_30d') return {}; // 백엔드 기본값
  const now = new Date();
  const days = preset === '7d' ? 7 : 1;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  };
}

export default function FieldsList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const refresh = useFieldStore((s) => s.refresh);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FieldStatus[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  // 첫 진입은 즉시 페치, 이후 필터 변경은 300ms debounce.
  // 사용자가 chip 을 빠르게 여러 번 토글해도 최종 상태로만 호출 → 백엔드 부담 + UX 깜박임 차단.
  const fetchedOnceRef = useRef(false);
  useEffect(() => {
    const fire = () => {
      void refresh({
        ...rangeToParams(rangePreset),
        status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
      });
    };
    if (!fetchedOnceRef.current) {
      fetchedOnceRef.current = true;
      fire();
      return;
    }
    const handle = setTimeout(fire, 300);
    return () => clearTimeout(handle);
  }, [refresh, statusFilter, rangePreset]);

  // 본인 fields 만 — 이후 모든 파생값의 기준
  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  const { projects: availableProjects, categories: availableCategories } = useMemo(
    () => collectFieldFacets(myFields),
    [myFields],
  );

  const fields = useMemo(
    () =>
      applyFieldFilters(myFields, {
        search,
        projectIds: projectFilter,
        categories: categoryFilter,
      }),
    [myFields, projectFilter, categoryFilter, search],
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

  const hasFilter =
    statusFilter.length > 0 ||
    rangePreset !== 'all' ||
    projectFilter.length > 0 ||
    categoryFilter.length > 0;

  // FlatList renderItem — useCallback 으로 stable reference. router 만 deps.
  const renderItem = useCallback(
    ({ item }: { item: import('@/types/entities').Field }) => (
      <FieldCard
        field={item}
        onPress={() => router.push(`/(tabs)/fields/${item.id}` as never)}
      />
    ),
    [router],
  );
  const keyExtractor = useCallback(
    (f: import('@/types/entities').Field) => String(f.id),
    [],
  );

  const { onScroll, visible } = useHideOnScroll();

  return (
    <MapSheetLayout title="현장">
      <View style={styles.toolbar}>
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
          {hasFilter ? (
            <FilterChip
              label="필터 해제"
              active={false}
              onPress={() => {
                setStatusFilter([]);
                setRangePreset('all');
                setProjectFilter([]);
                setCategoryFilter([]);
              }}
              dashed
              leftIcon="close"
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
        <View style={styles.chipRowWithLabel}>
          <Text variant="caption" weight="bold" color="textMuted" style={styles.rangeLabel}>
            방문일
          </Text>
          {RANGE_ORDER.map((p) => (
            <FilterChip
              key={p}
              label={RANGE_LABEL[p]}
              active={rangePreset === p}
              onPress={() => setRangePreset(p)}
            />
          ))}
        </View>
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        // gorhom 은 onScroll 을 public 타입에서 제외하지만 런타임엔 useScrollHandler 로 전달함.
        {...({ onScroll } as object)}
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
      <StickyBottomBar visible={visible}>
        <Button
          onPress={() => router.push('/(tabs)/fields/new' as never)}
          size="lg"
          fullWidth
          leftIcon="add-circle"
        >
          새 현장
        </Button>
      </StickyBottomBar>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  chipRowWithLabel: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  rangeLabel: {
    marginRight: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: { padding: spacing.lg, paddingBottom: 120 },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { FieldCard } from '@/components/FieldCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MapSheetLayout, sheetScrollableStyle } from '@/components/MapSheetLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { StickyBottomBar } from '@/components/ui/StickyBottomBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { useHideOnScroll } from '@/components/ui/useHideOnScroll';
import { FIELD_STATUS_VALUES, type FieldStatus } from '@/types/entities';
import { collectFieldFacets, applyFieldFilters, mergeCategoryNames } from '@/utils/fieldFacets';
import { useCategoryStore } from '@/stores/categoryStore';
import { FieldFilterBar } from '@/components/fields/FieldFilterBar';
import { FieldStatusSummary } from '@/components/fields/FieldStatusSummary';
import { useQuickPhoto } from '@/components/fields/useQuickPhoto';
import { QuickPhotoSheet } from '@/components/fields/QuickPhotoSheet';
import { colors } from '@/theme/colors';
import { listBottomInset, spacing } from '@/theme/spacing';

export default function FieldsList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const refresh = useFieldStore((s) => s.refresh);
  const listStatus = useFieldStore((s) => s.listStatus);
  const listError = useFieldStore((s) => s.listError);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  // 첫 진입은 즉시 페치, 이후 필터 변경은 300ms debounce.
  // status·방문일은 서버 refresh 로 재조회, project·category 는 아래 클라 필터로 처리.
  const fetchedOnceRef = useRef(false);
  // 재시도(ErrorState)도 같은 파라미터로 다시 쏴야 한다 — 맨 refresh() 를 부르면
  // status·방문일 필터가 빠진 전체 목록이 실려와 필터칩이 거짓말을 한다.
  const fetchFields = useCallback(() => {
    void refresh({
      status: status ?? undefined,
      ...(fromDate || toDate
        ? { fromDate: fromDate ?? undefined, toDate: toDate ?? undefined }
        : { visitDateScope: 'all' }),
    });
  }, [refresh, status, fromDate, toDate]);
  useEffect(() => {
    if (!fetchedOnceRef.current) {
      fetchedOnceRef.current = true;
      fetchFields();
      return;
    }
    const handle = setTimeout(fetchFields, 300);
    return () => clearTimeout(handle);
  }, [fetchFields]);

  // 카테고리 마스터 로드 — 필터 후보에 아직 현장에 안 붙은 카테고리도 노출.
  useEffect(() => {
    void useCategoryStore.getState().hydrate();
  }, []);

  // 본인 fields 만 — 이후 모든 파생값의 기준
  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  const { projects: availableProjects, categories: facetCategories } = useMemo(
    () => collectFieldFacets(myFields),
    [myFields],
  );
  // 카테고리 필터 후보 = 마스터 집합 ∪ 기존 현장 값(레거시 보존).
  const masterCategories = useCategoryStore((s) => s.categories);
  const availableCategories = useMemo(
    () => mergeCategoryNames(masterCategories.map((c) => c.name), facetCategories),
    [masterCategories, facetCategories],
  );

  const fields = useMemo(
    () =>
      applyFieldFilters(myFields, {
        search,
        projectIds: projectId ? [projectId] : undefined,
        categories: category ? [category] : undefined,
      }),
    [myFields, projectId, category, search],
  );

  const hasFilter =
    status !== null ||
    projectId !== null ||
    category !== null ||
    fromDate !== null ||
    toDate !== null;

  // 상태 분포 — 필터가 걸리면 의미가 없다. status/방문일 필터는 서버 refresh 로
  // 걸리므로 myFields 자체가 이미 좁혀져 있어, 분포를 그리면 "조치 전 12 / 나머지 0"
  // 같은 거짓 그림이 나온다. 그래서 아래 렌더에서 무필터일 때만 보여준다.
  const statusCounts = useMemo(() => {
    const out = Object.fromEntries(
      FIELD_STATUS_VALUES.map((s) => [s, 0]),
    ) as Record<FieldStatus, number>;
    for (const f of myFields) out[f.status] += 1;
    return out;
  }, [myFields]);

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

  // Quick Photo — 촬영 → 최근접 현장 자동 매칭 등록 (계획 §4-3 진입점).
  const quickPhoto = useQuickPhoto();

  return (
    <MapSheetLayout title="현장">
      <View style={styles.toolbar}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="제목 검색"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          leftSlot={<Ionicons name="search" size={18} color={colors.textMuted} />}
        />
        <FieldFilterBar
          status={status}
          onStatus={setStatus}
          projects={availableProjects}
          projectId={projectId}
          onProject={setProjectId}
          categories={availableCategories}
          category={category}
          onCategory={setCategory}
          fromDate={fromDate}
          toDate={toDate}
          onDateRange={(from, to) => {
            setFromDate(from);
            setToDate(to);
          }}
          onResetAll={() => {
            setStatus(null);
            setProjectId(null);
            setCategory(null);
            setFromDate(null);
            setToDate(null);
          }}
          hasFilter={hasFilter}
        />
        {search || hasFilter ? (
          <View style={styles.summary}>
            <Ionicons name="search" size={14} color={colors.textMuted} />
            <Text variant="caption" weight="semibold" color="textMuted" numeric>
              {search ? '검색 결과' : '필터 결과'} {fields.length}건
            </Text>
          </View>
        ) : (
          <FieldStatusSummary counts={statusCounts} />
        )}
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={sheetScrollableStyle}
        contentContainerStyle={styles.list}
        // gorhom 은 onScroll 을 public 타입에서 제외하지만 런타임엔 useScrollHandler 로 전달함.
        {...({ onScroll } as object)}
        // 목록이 비어 보이는 이유가 셋(로딩 중·조회 실패·진짜 없음)이라 셋을 갈라 렌더한다.
        // 실패를 EmptyState 로 보여주면 사용자가 '배정 없음' 으로 오독한다 (강령 3).
        //
        // 단 loading/error 는 **받아둔 데이터가 아예 없을 때만** 이긴다. 스토어가 실패해도
        // fields 를 비우지 않으므로, 데이터가 있는 채로 status 만 'error' 인 상태가 생긴다
        // (다른 탭이 hydrate 를 다시 돌리다 실패하는 경우 등). 그때 검색 결과가 0건이면
        // "검색 결과가 없습니다" 가 맞는데 ErrorState 가 덮어써 버린다 — 그래서 데이터
        // 유무로 먼저 가른다.
        ListEmptyComponent={
          allFields.length === 0 && listStatus === 'loading' ? (
            <LoadingState label="현장을 불러오는 중" inline />
          ) : allFields.length === 0 && listStatus === 'error' ? (
            <ErrorState message={listError} onRetry={fetchFields} />
          ) : (
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
          )
        }
      />
      <StickyBottomBar visible={visible}>
        <View style={styles.bottomBarRow}>
          <Button
            onPress={() => router.push('/(tabs)/fields/new' as never)}
            size="lg"
            leftIcon="add-circle"
            style={styles.bottomBarMain}
          >
            새 현장
          </Button>
          <Button
            onPress={() => void quickPhoto.start()}
            variant="secondary"
            size="lg"
            leftIcon="camera"
            loading={quickPhoto.preparing}
            accessibilityLabel="빠른 촬영 — 가까운 현장에 사진 등록"
          >
            촬영
          </Button>
        </View>
      </StickyBottomBar>
      <QuickPhotoSheet
        session={quickPhoto.session}
        uploading={quickPhoto.uploading}
        onUpload={(f) => void quickPhoto.upload(f)}
        onFallback={quickPhoto.toFallback}
        onCreateNew={quickPhoto.createNew}
        onClose={quickPhoto.cancel}
      />
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  list: { padding: spacing.lg, paddingBottom: listBottomInset },
  bottomBarRow: { flexDirection: 'row', gap: spacing.md },
  bottomBarMain: { flex: 1 },
});

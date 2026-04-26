import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { FieldCard } from '@/components/FieldCard';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { FIELD_STATUS_VALUES, type FieldStatus } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

const STATUS_LABEL: Record<FieldStatus, string> = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
};

export default function FieldsList() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const refresh = useFieldStore((s) => s.refresh);

  const [search, setSearch] = useState('');
  // status 다중 선택. 빈 배열 = 전체
  const [statusFilter, setStatusFilter] = useState<FieldStatus[]>([]);

  // 탭 진입 시 + status 필터 변경 시 mine 페치 (visitDateScope=all 로 신규 현장도 노출)
  useEffect(() => {
    void refresh({
      visitDateScope: 'all',
      status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
    });
  }, [refresh, statusFilter]);

  const fields = useMemo(() => {
    if (!userId) return [];
    const mine = allFields.filter((f) => f.userId === userId);
    const q = search.trim().toLowerCase();
    if (!q) return mine;
    // 클라이언트 측 텍스트 검색 — 주소·상세주소 LIKE
    return mine.filter(
      (f) =>
        f.address.toLowerCase().includes(q) ||
        (f.addressDetail ?? '').toLowerCase().includes(q),
    );
  }, [allFields, userId, search]);

  const toggleStatus = (s: FieldStatus) =>
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  return (
    <MapSheetLayout title="현장">
      <View style={styles.toolbar}>
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
          {statusFilter.length > 0 ? (
            <Pressable onPress={() => setStatusFilter([])} style={styles.chip}>
              <Text style={styles.chipText}>해제</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <BottomSheetFlatList
        data={fields}
        keyExtractor={(f) => String(f.id)}
        renderItem={({ item }) => (
          <FieldCard
            field={item}
            onPress={() => router.push(`/(tabs)/fields/${item.id}` as never)}
          />
        )}
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
                : '아래 버튼으로 새 현장을 등록하세요'
            }
          />
        }
      />
      <Pressable
        onPress={() => router.push('/(tabs)/fields/new' as never)}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Text style={styles.fabText}>+ 새 현장</Text>
      </Pressable>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
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
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted },
  list: { padding: spacing.lg, paddingBottom: 120 },
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
  pressed: { opacity: 0.85 },
  fabText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});

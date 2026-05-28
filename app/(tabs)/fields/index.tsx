import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  FIELD_STATUS_VALUES,
  FIELD_STATUS_LABEL,
  type FieldStatus,
} from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

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

  // 탭 진입 시 + status/기간 필터 변경 시 mine 페치
  useEffect(() => {
    void refresh({
      ...rangeToParams(rangePreset),
      status: statusFilter.length > 0 ? statusFilter.join(',') : undefined,
    });
  }, [refresh, statusFilter, rangePreset]);

  const fields = useMemo(() => {
    if (!userId) return [];
    const mine = allFields.filter((f) => f.userId === userId);
    const q = search.trim().toLowerCase();
    if (!q) return mine;
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

  const hasFilter = statusFilter.length > 0 || rangePreset !== 'all';

  return (
    <MapSheetLayout title="현장">
      <View style={styles.toolbar}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="주소·상세주소 검색"
          autoCapitalize="none"
          leftSlot={<Ionicons name="search" size={18} color={colors.textMuted} />}
        />
        <View style={styles.chipRow}>
          {FIELD_STATUS_VALUES.map((s) => {
            const active = statusFilter.includes(s);
            const c = colors.fieldStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => toggleStatus(s)}
                style={({ pressed }) => [
                  styles.chip,
                  active && { backgroundColor: c + '22', borderColor: c },
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && { color: c, fontWeight: fontWeight.bold },
                  ]}
                >
                  {FIELD_STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
          {hasFilter ? (
            <Pressable
              onPress={() => {
                setStatusFilter([]);
                setRangePreset('all');
              }}
              style={({ pressed }) => [
                styles.chip,
                styles.chipReset,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Ionicons name="close" size={12} color={colors.textMuted} />
              <Text style={styles.chipText}>필터 해제</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.chipRow}>
          {RANGE_ORDER.map((p) => {
            const active = rangePreset === p;
            return (
              <Pressable
                key={p}
                onPress={() => setRangePreset(p)}
                style={({ pressed }) => [
                  styles.chip,
                  active && {
                    backgroundColor: colors.primaryMuted,
                    borderColor: colors.primary,
                  },
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && { color: colors.primary, fontWeight: fontWeight.bold },
                  ]}
                >
                  {RANGE_LABEL[p]}
                </Text>
              </Pressable>
            );
          })}
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
            icon={search || hasFilter ? 'search-outline' : 'location-outline'}
            title={
              search || hasFilter ? '검색 결과가 없습니다' : '담당 현장이 없습니다'
            }
            description={
              search || hasFilter
                ? '검색어 또는 필터를 조정해보세요'
                : '아래 버튼으로 새 현장을 등록하세요'
            }
          />
        }
      />
      <View style={styles.ctaWrap}>
        <Button
          onPress={() => router.push('/(tabs)/fields/new' as never)}
          size="lg"
          fullWidth
          leftIcon="add-circle"
        >
          새 현장
        </Button>
      </View>
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipReset: { borderStyle: 'dashed' },
  chipText: { fontSize: fontSize.xs, color: colors.textMuted },
  list: { padding: spacing.lg, paddingBottom: 120 },
  ctaWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
  },
});

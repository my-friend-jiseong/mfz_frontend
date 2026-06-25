import { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { applyFieldFilters } from '@/utils/fieldFacets';
import type { Field } from '@/types/entities';

// 레이어 FAB(44px) 폭 + 간격만큼 우측을 비워 검색창이 FAB 와 겹치지 않게.
const FAB_RESERVE = 44 + spacing.sm;
const MAX_RESULTS = 6;

interface Props {
  // 검색 대상 현장(메인 탭에선 내 현장 전체). 이름(주소)·상세·프로젝트·분류로 매칭.
  fields: Field[];
  // 결과 선택 시 — 지도를 그 현장으로 이동(MapDashboard 가 recenter 연결).
  onSelectField: (field: Field) => void;
}

// 지도 상단 떠 있는 검색창 — 현장을 이름(주소)으로 찾아 지도를 이동시킨다.
// 결과 노출은 focus 가 아니라 query 유무로 제어(결과 탭 시 blur 가 먼저 떠 press 가 씹히는 회로 차단).
// 선택/clear 로 query 를 비우면 닫힌다.
export function MapSearchBar({ fields, onSelectField }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return applyFieldFilters(fields, { search: q }).slice(0, MAX_RESULTS);
  }, [query, fields]);

  const open = query.trim().length > 0;

  const handleSelect = (field: Field) => {
    onSelectField(field);
    setQuery('');
    Keyboard.dismiss();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[styles.anchor, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.bar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="현장 이름·주소 검색"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {open ? (
          <View style={styles.results}>
            {results.length === 0 ? (
              <Text variant="bodySm" color="textMuted" style={styles.empty}>
                검색 결과 없음
              </Text>
            ) : (
              results.map((f, i) => {
                const secondary =
                  f.addressDetail || f.projectName || f.categories?.join(' · ') || '';
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => handleSelect(f)}
                    style={({ pressed }) => [
                      styles.item,
                      i > 0 && styles.itemDivider,
                      pressed && styles.itemPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`현장 ${f.address}`}
                  >
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={colors.primary}
                      style={styles.itemIcon}
                    />
                    <View style={styles.itemText}>
                      <Text variant="bodySm" numberOfLines={1}>
                        {f.address}
                      </Text>
                      {secondary ? (
                        <Text variant="caption" color="textMuted" numberOfLines={1}>
                          {secondary}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg + FAB_RESERVE,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.raised,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  results: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.raised,
  },
  empty: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  itemIcon: {
    marginTop: 1,
  },
  itemText: {
    flex: 1,
  },
});

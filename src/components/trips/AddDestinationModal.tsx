import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// 진행 중 외근에 destination 단건 추가 — 본인 fields 중 이미 외근에 포함되지 않은 것만 노출.
// 새 현장 등록 진입로는 dashed 행으로 두어 "여기 없으면" 흐름도 지원.

interface Props {
  visible: boolean;
  tripId: string;
  onClose: () => void;
  // 외부 라우터 의존을 피하기 위해 새 현장 등록 진입은 callback 으로 위임.
  onCreateNew?: () => void;
}

export function AddDestinationModal({
  visible,
  tripId,
  onClose,
  onCreateNew,
}: Props) {
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  // selector 는 tripId 로 좁힌 stable string key (sort 후 join) — zustand 의 === 비교가
  // 동작하도록 primitive 반환. 이 trip 의 destinations 가 실제로 변할 때만 rerender.
  // 새 객체 (Set/Array) 를 selector 에서 반환하면 매번 reference inequality 라 rerender.
  const usedFieldIdsKey = useDestinationStore((s) => {
    const ids: string[] = [];
    for (const d of s.destinations) {
      if (d.tripId === tripId) ids.push(d.fieldId);
    }
    return ids.sort().join(',');
  });
  const add = useDestinationStore((s) => s.add);

  const [query, setQuery] = useState('');

  const usedFieldIds = useMemo(
    () => new Set(usedFieldIdsKey ? usedFieldIdsKey.split(',') : []),
    [usedFieldIdsKey],
  );

  const candidates = useMemo(() => {
    if (!userId) return [];
    let list = allFields.filter(
      (f) => f.userId === userId && !usedFieldIds.has(f.id),
    );
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.address.toLowerCase().includes(q) ||
          (f.addressDetail ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [allFields, userId, usedFieldIds, query]);

  const handlePick = (fieldId: string) => {
    const created = add(tripId, fieldId);
    // 중복은 store 에서 null — 후보 목록이 이미 필터링되어 사실상 발생 X. 방어적으로 무시.
    if (created) {
      setQuery('');
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.headRow}>
            <Text variant="h3">현장 추가</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="닫기"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text variant="bodySm" color="textMuted">
            진행 중 외근의 마지막 목적지로 추가됩니다.
          </Text>

          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="주소·상세주소 검색"
            autoCapitalize="none"
            clearButtonMode="while-editing"
            leftSlot={
              <Ionicons name="search" size={18} color={colors.textMuted} />
            }
            containerStyle={styles.searchField}
          />

          {candidates.length === 0 ? (
            <EmptyState
              icon={query ? 'search-outline' : 'location-outline'}
              title={
                query
                  ? '검색 결과가 없습니다'
                  : usedFieldIds.size > 0
                    ? '추가할 수 있는 현장이 없습니다'
                    : '담당 현장이 없습니다'
              }
              description={
                query
                  ? '검색어를 조정해보세요'
                  : usedFieldIds.size > 0
                    ? '본인 현장 모두 이 외근에 포함되어 있습니다'
                    : '새 현장을 등록해주세요'
              }
            />
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {candidates.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => handlePick(f.id)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    fieldDetailLine(f)
                      ? `${f.address} 추가, ${fieldDetailLine(f)}`
                      : `${f.address} 추가`
                  }
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { opacity: opacity.pressed },
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text variant="body" weight="semibold" numberOfLines={1}>
                      {f.address}
                    </Text>
                    {fieldDetailLine(f) ? (
                      <Text
                        variant="caption"
                        color="textMuted"
                        numberOfLines={1}
                        style={styles.rowDetail}
                      >
                        {fieldDetailLine(f)}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="add-circle"
                    size={22}
                    color={colors.primary}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}

          {onCreateNew ? (
            <Button
              onPress={() => {
                onClose();
                onCreateNew();
              }}
              variant="ghost"
              size="sm"
              leftIcon="add-circle-outline"
              fullWidth
              style={styles.createNewBtn}
            >
              새 현장 등록
            </Button>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchField: { marginTop: spacing.sm },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1 },
  rowDetail: { marginTop: 2 },
  createNewBtn: { marginTop: spacing.sm },
});

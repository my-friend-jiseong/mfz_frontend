import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCategoryStore } from '@/stores/categoryStore';
import { useFieldStore } from '@/stores/fieldStore';
import { collectFieldFacets } from '@/utils/fieldFacets';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';

// 현장 폼에서 카테고리(분류) 다중 선택 — 마스터 집합에서 고르거나 인라인 추가.
// 값은 카테고리 "이름" 배열(Field.categories 계약 그대로). ProjectPicker UX 복제 + 다중 선택.

interface Props {
  value: string[];
  onChange: (names: string[]) => void;
  disabled?: boolean;
}

export function CategoryMultiPicker({ value, onChange, disabled }: Props) {
  const router = useRouter();
  const categories = useCategoryStore((s) => s.categories);
  const busy = useCategoryStore((s) => s.busy);
  const refresh = useCategoryStore((s) => s.refresh);
  const create = useCategoryStore((s) => s.create);
  const seed = useCategoryStore((s) => s.seed);
  const allFields = useFieldStore((s) => s.fields);

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // 열릴 때 1회 로드 + 기존 현장 카테고리로 시드(무손실 마이그레이션).
  useEffect(() => {
    if (!open) return;
    void refresh();
    seed(collectFieldFacets(allFields).categories);
  }, [open, refresh, seed, allFields]);

  // 옵션 = 마스터 이름 ∪ 현재 값(레거시 값도 유지·해제 가능).
  const optionNames = useMemo(() => {
    const set = new Set<string>([...categories.map((c) => c.name), ...value]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, value]);

  const toggle = (name: string) =>
    onChange(
      value.includes(name)
        ? value.filter((x) => x !== name)
        : [...value, name],
    );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const r = await create(name);
    setCreating(false);
    if (r.ok) {
      if (!value.includes(r.category.name)) onChange([...value, r.category.name]);
      setNewName('');
    } else {
      Alert.alert('카테고리 추가 실패', r.error);
    }
  };

  const triggerLabel =
    value.length > 0 ? value.join(', ') : '분류 선택 (선택)';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          value.length ? `분류: ${value.join(', ')}` : '분류 선택'
        }
        accessibilityState={{ disabled: !!disabled }}
        style={({ pressed }) => [
          styles.trigger,
          value.length ? styles.triggerSelected : null,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.triggerInner}>
          <Ionicons
            name={value.length ? 'pricetag' : 'pricetag-outline'}
            size={16}
            color={value.length ? colors.primary : colors.textMuted}
          />
          <Text
            variant="body"
            weight={value.length ? 'semibold' : 'bold'}
            color={value.length ? 'text' : 'textMuted'}
            style={styles.triggerText}
            numberOfLines={1}
          >
            {triggerLabel}
          </Text>
        </View>
        {value.length ? (
          <Pressable
            onPress={() => onChange([])}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="분류 전체 해제"
            style={styles.clearBtn}
          >
            <Text variant="caption" weight="bold" color="textMuted">
              해제
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => undefined}>
            <View style={styles.headerRow}>
              <Text variant="h3">분류 선택</Text>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.push('/(tabs)/fields/categories' as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="카테고리 관리"
                style={({ pressed }) => [styles.manageLink, pressed && styles.pressed]}
              >
                <Ionicons name="settings-outline" size={14} color={colors.primary} />
                <Text variant="caption" weight="bold" color="primary">
                  카테고리 관리
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {busy && optionNames.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.emptyHint}>
                  불러오는 중...
                </Text>
              ) : optionNames.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.emptyHint}>
                  등록된 카테고리가 없습니다. 아래에서 추가하세요.
                </Text>
              ) : (
                optionNames.map((name) => {
                  const active = value.includes(name);
                  return (
                    <Pressable
                      key={name}
                      onPress={() => toggle(name)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`분류 ${name}`}
                      style={[styles.item, active && styles.itemActive]}
                    >
                      <Text
                        variant="bodySm"
                        weight={active ? 'bold' : 'semibold'}
                        color={active ? 'primary' : 'text'}
                        style={styles.itemText}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark" size={16} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.createBox}>
              <Text variant="caption" weight="bold" color="textMuted">
                새 카테고리
              </Text>
              <View style={styles.createRow}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  style={styles.createInput}
                  placeholder="예: 가로수"
                  maxLength={40}
                  onSubmitEditing={() => void handleCreate()}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={() => void handleCreate()}
                  disabled={creating || !newName.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="새 카테고리 추가"
                  accessibilityState={{ disabled: creating || !newName.trim() }}
                  style={({ pressed }) => [
                    styles.createBtn,
                    (creating || !newName.trim()) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text variant="bodySm" weight="bold" color="onPrimary">
                    {creating ? '...' : '추가'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text variant="bodySm" weight="semibold" color="textMuted">
                닫기
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  triggerSelected: {
    borderColor: colors.primary,
    borderStyle: 'solid',
    backgroundColor: withAlpha(colors.primary, 0.06),
  },
  triggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  triggerText: { flex: 1 },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

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
    maxHeight: '85%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.4),
  },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemActive: { borderColor: colors.primary, backgroundColor: withAlpha(colors.primary, 0.06) },
  itemText: { flex: 1 },
  emptyHint: { padding: spacing.md },

  createBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  createRow: { flexDirection: 'row', gap: spacing.sm },
  createInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  createBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
});

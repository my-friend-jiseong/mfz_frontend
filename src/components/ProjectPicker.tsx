import { useEffect, useState } from 'react';
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
import { useProjectStore } from '@/stores/projectStore';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';

// ERD v2: 현장 폼에서 소속 프로젝트 선택. 비어있을 때 진입 시 1회 lazy load + 인라인 생성.

interface Props {
  value: string | null | undefined;
  onChange: (projectId: string | null) => void;
  disabled?: boolean;
  // 라벨 표시용 — projectName 이 있으면 우선 사용(서버 응답에서 받은 값), 없으면 store 에서 조회.
  initialLabel?: string | null;
}

export function ProjectPicker({ value, onChange, disabled, initialLabel }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const busy = useProjectStore((s) => s.busy);
  const refresh = useProjectStore((s) => s.refresh);
  const create = useProjectStore((s) => s.create);
  const getById = useProjectStore((s) => s.getById);

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // 열릴 때 비어있으면 한 번 로드
  useEffect(() => {
    if (open && projects.length === 0 && !busy) void refresh();
  }, [open, projects.length, busy, refresh]);

  const selected = value ? getById(value) : null;
  const label =
    selected?.name ?? (value ? initialLabel ?? '프로젝트' : null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const r = await create({ name });
    setCreating(false);
    if (r.ok) {
      onChange(r.project.id);
      setNewName('');
      setOpen(false);
    } else {
      Alert.alert('프로젝트 생성 실패', r.error);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.trigger,
          value ? styles.triggerSelected : null,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.triggerInner}>
          <Ionicons
            name={value ? 'folder' : 'add-circle-outline'}
            size={16}
            color={value ? colors.primary : colors.textMuted}
          />
          <Text
            variant="body"
            weight={value ? 'semibold' : 'bold'}
            color={value ? 'text' : 'textMuted'}
            style={styles.triggerText}
          >
            {label ?? '프로젝트 선택 (선택)'}
          </Text>
        </View>
        {value ? (
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
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
            <Text variant="h3">프로젝트 선택</Text>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              <Pressable
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                style={[styles.item, !value && styles.itemActive]}
              >
                <Text
                  variant="bodySm"
                  weight={!value ? 'bold' : 'semibold'}
                  color={!value ? 'primary' : 'text'}
                >
                  프로젝트 없음
                </Text>
              </Pressable>
              {busy && projects.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.emptyHint}>
                  불러오는 중...
                </Text>
              ) : projects.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.emptyHint}>
                  등록된 프로젝트가 없습니다.
                </Text>
              ) : (
                projects.map((p) => {
                  const active = p.id === value;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                      style={[styles.item, active && styles.itemActive]}
                    >
                      <Text
                        variant="bodySm"
                        weight={active ? 'bold' : 'semibold'}
                        color={active ? 'primary' : 'text'}
                      >
                        {p.name}
                      </Text>
                      {p.status && p.status !== 'active' ? (
                        <Text variant="caption" color="textMuted" style={styles.itemMeta}>
                          {p.status}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.createBox}>
              <Text variant="caption" weight="bold" color="textMuted">
                새 프로젝트
              </Text>
              <View style={styles.createRow}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  style={styles.createInput}
                  placeholder="프로젝트 이름"
                  maxLength={100}
                />
                <Pressable
                  onPress={() => void handleCreate()}
                  disabled={creating || !newName.trim()}
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
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  item: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemActive: { borderColor: colors.primary, backgroundColor: withAlpha(colors.primary, 0.06) },
  itemMeta: { marginTop: 2 },
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

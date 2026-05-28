import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useProjectStore } from '@/stores/projectStore';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

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
        <Text style={value ? styles.triggerText : styles.placeholder}>
          {label ? `📁 ${label}` : '+ 프로젝트 선택 (선택)'}
        </Text>
        {value ? (
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>해제</Text>
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
            <Text style={styles.cardTitle}>프로젝트 선택</Text>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              <Pressable
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                style={[styles.item, !value && styles.itemActive]}
              >
                <Text style={[styles.itemText, !value && styles.itemTextActive]}>
                  프로젝트 없음
                </Text>
              </Pressable>
              {busy && projects.length === 0 ? (
                <Text style={styles.emptyHint}>불러오는 중...</Text>
              ) : projects.length === 0 ? (
                <Text style={styles.emptyHint}>등록된 프로젝트가 없습니다.</Text>
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
                      <Text style={[styles.itemText, active && styles.itemTextActive]}>
                        {p.name}
                      </Text>
                      {p.status && p.status !== 'active' ? (
                        <Text style={styles.itemMeta}>{p.status}</Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.createBox}>
              <Text style={styles.createLabel}>새 프로젝트</Text>
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
                  <Text style={styles.createBtnText}>
                    {creating ? '...' : '추가'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>닫기</Text>
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
    backgroundColor: colors.primary + '10',
  },
  triggerText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  placeholder: { fontSize: fontSize.base, color: colors.textMuted, fontWeight: '700' },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  clearBtnText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
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
  itemActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  itemText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  itemTextActive: { color: colors.primary, fontWeight: '700' },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted, padding: spacing.md },

  createBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  createLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700' },
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
  createBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },

  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
});

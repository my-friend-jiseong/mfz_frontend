import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCategoryStore } from '@/stores/categoryStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { collectFieldFacets } from '@/utils/fieldFacets';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Category } from '@/types/entities';
import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';
import { spacing, radius, fontSize, touchTarget } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

// 아이콘 버튼(18px 아이콘 + padding xs = 26px)이 Direction 의 '터치 타깃 44 이상' 에 못 미친다.
// 보이는 크기를 키우면 목록 행이 통째로 두꺼워지므로 hitSlop 으로 채운다 — Button sm 과 같은 방법.
const ICON_HIT_SLOP = (touchTarget.control - 26) / 2;

// 카테고리(분류) 관리 — 추가·이름변경·삭제. 진실원은 서버(/api/categories, 백로그 §25).
// AsyncStorage 는 오프라인 표시용 캐시라, 서버 실패 시 store 가 화면 변경을 되돌린다.
export default function CategoriesManage() {
  const categories = useCategoryStore((s) => s.categories);
  const busy = useCategoryStore((s) => s.busy);
  const refresh = useCategoryStore((s) => s.refresh);
  const seed = useCategoryStore((s) => s.seed);
  const create = useCategoryStore((s) => s.create);
  const rename = useCategoryStore((s) => s.rename);
  const remove = useCategoryStore((s) => s.remove);
  const allFields = useFieldStore((s) => s.fields);
  const userId = useAuthStore((s) => s.user?.id);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // refresh(=hydrate) 완료 후 마스터가 비어 있을 때만 **본인** 현장 카테고리로 시드.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
      const mine = userId ? allFields.filter((f) => f.userId === userId) : [];
      await seed(collectFieldFacets(mine).categories);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, seed, allFields, userId]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await create(name);
    if (r.ok) setNewName('');
    else Alert.alert('추가 실패', r.error);
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const r = await rename(editingId, editName);
    if (r.ok) {
      setEditingId(null);
      setEditName('');
    } else {
      Alert.alert('이름 변경 실패', r.error ?? '');
    }
  };

  const confirmDelete = (c: Category) => {
    Alert.alert(
      '카테고리 삭제',
      `"${c.name}" 을(를) 삭제할까요?\n이미 이 분류가 붙은 현장의 값은 그대로 남습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          // 서버가 진실원이라 실패 시 store 가 목록을 되돌린다 — 사용자에게 이유를 알려준다.
          onPress: () =>
            void remove(c.id).then((r) => {
              if (!r.ok) Alert.alert('카테고리 삭제 실패', r.error);
            }),
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Category }) => {
    const editing = editingId === item.id;
    return (
      <Card padding="md" style={styles.row}>
        {editing ? (
          <>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.editInput}
              maxLength={40}
              autoFocus
              onSubmitEditing={() => void saveEdit()}
              returnKeyType="done"
            />
            <Pressable
              onPress={() => void saveEdit()}
              accessibilityRole="button"
              accessibilityLabel="이름 저장"
              hitSlop={ICON_HIT_SLOP}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => {
                setEditingId(null);
                setEditName('');
              }}
              accessibilityRole="button"
              accessibilityLabel="편집 취소"
              hitSlop={ICON_HIT_SLOP}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </>
        ) : (
          <>
            <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
            <Text variant="body" style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Pressable
              onPress={() => startEdit(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} 이름 변경`}
              hitSlop={ICON_HIT_SLOP}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Ionicons name="pencil" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} 삭제`}
              hitSlop={ICON_HIT_SLOP}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </>
        )}
      </Card>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.addBox}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          style={styles.addInput}
          placeholder="새 카테고리 이름 (예: 가로수)"
          placeholderTextColor={colors.textMuted}
          maxLength={40}
          onSubmitEditing={() => void handleAdd()}
          returnKeyType="done"
        />
        {/* 손으로 짠 primary 버튼이었다 — 색·아이콘·비활성·누름을 전부 직접 조합하고 있었고
            터치 높이도 입력란에 딸려 갔다. Button 이 그걸 다 갖고 있다 (강령 7). */}
        <Button
          onPress={() => void handleAdd()}
          disabled={busy || !newName.trim()}
          accessibilityLabel="카테고리 추가"
          leftIcon="add"
        >
          추가
        </Button>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="pricetags-outline"
            title="카테고리가 없습니다"
            description="위에서 첫 카테고리를 추가하세요"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  addBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  addInput: {
    flex: 1,
    backgroundColor: colors.control.bg,
    borderWidth: 1,
    borderColor: colors.control.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    // RN TextInput 은 폰트를 상속하지 않는다 — 명시 없으면 시스템 폰트로 렌더된다.
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  pressed: { opacity: opacity.pressed },
  list: { padding: spacing.lg, gap: spacing.sm },
  // 표면은 Card 가 준다 (강령 7) — 행 배치만 남긴다.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  // 입력 표면은 control 토큰 (5.3.1) — 주변 카드보다 어두운 inset.
  // 인라인 편집 중이라 테두리는 focus 색을 그대로 쓴다.
  editInput: {
    flex: 1,
    backgroundColor: colors.control.bg,
    borderWidth: 1,
    borderColor: colors.control.borderFocus,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.base,
    // RN TextInput 은 폰트를 상속하지 않는다 — 명시 없으면 시스템 폰트로 렌더된다.
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  // 18px 아이콘 + padding xs = 26px 로 Direction 의 '터치 타깃 44 이상' 을 못 맞춘다.
  // 보이는 크기는 두고 hitSlop 으로 채운다(Button sm 과 같은 방법) — 아래 ICON_HIT_SLOP.
  iconBtn: { padding: spacing.xs },
});

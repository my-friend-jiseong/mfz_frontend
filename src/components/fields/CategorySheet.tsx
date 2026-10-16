import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { SheetTextInput } from '@/components/ui/SheetTextInput';
import { SelectRow } from '@/components/ui/SelectRow';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { FieldMessage } from '@/components/ui/FormField2';
import { showPopoverMenu } from '@/components/ui/PopoverMenu';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/icons';
import { useCategoryStore, norm } from '@/stores/categoryStore';
import { useFieldStore } from '@/stores/fieldStore';
import { deleteCategoryEverywhere, renameCategoryEverywhere } from '@/utils/categoryCascade';
import { c2, radius2, space, type2 } from '@/theme/v2';
import { fontFamily } from '@/theme/typography';

interface Props {
  open: boolean;
  /** 제목 아래 '낙동대로 355 · 여러 개 고를 수 있어요' 의 앞부분. */
  placeName: string;
  /** 시트를 열 때의 선택. */
  initial: string[];
  /** X·끌어내리기·바깥 누르기 — 어떻게 닫든 고른 것이 그대로 반영된다(완료 버튼 없음, v135). */
  onClose: (selected: string[]) => void;
}

type Editing = { kind: 'rename'; id: string; name: string } | { kind: 'new' } | null;

/**
 * 5-6 분류 선택 시트(여러 개). 행 ⋯ → 5-7 [이름 변경][삭제], 5-8 행 안 이름 바꾸기, 5-9 삭제 확인,
 * 5-12 맨 아래 새 분류 입력 줄. 이름 변경·삭제는 그 분류가 붙은 현장에도 반영한다(categoryCascade).
 */
export function CategorySheet({ open, placeName, initial, onClose }: Props) {
  const categories = useCategoryStore((s) => s.categories);
  const fields = useFieldStore((s) => s.fields);
  const [selected, setSelected] = useState<string[]>(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 열 때마다 처음 선택으로 맞추고 목록을 서버와 맞춘다.
  useEffect(() => {
    if (!open) return;
    setSelected(initial);
    setEditing(null);
    setError(null);
    void useCategoryStore.getState().refresh();
    // '현장 N곳'은 내 현장 전체로 센다 — 아직 못 받았으면 받는다.
    if (useFieldStore.getState().listStatus === 'idle') void useFieldStore.getState().hydrate();
    // initial 은 열 때의 값만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fields) for (const c of f.categories ?? []) m.set(norm(c), (m.get(norm(c)) ?? 0) + 1);
    return m;
  }, [fields]);
  const countOf = (name: string) => countByName.get(norm(name)) ?? 0;

  // 마스터에 없는 이 현장의 옛 분류도 목록에 보인다(지우지 않게).
  const rows = useMemo(() => {
    const list = categories.map((c) => ({ id: c.id, name: c.name, master: true }));
    for (const name of initial) {
      if (!list.some((r) => norm(r.name) === norm(name))) list.push({ id: `legacy:${name}`, name, master: false });
    }
    return list;
  }, [categories, initial]);

  const isOn = (name: string) => selected.some((s) => norm(s) === norm(name));
  const toggle = (name: string) =>
    setSelected((prev) => (prev.some((s) => norm(s) === norm(name)) ? prev.filter((s) => norm(s) !== norm(name)) : [...prev, name]));

  const startEdit = (next: Editing) => {
    setEditing(next);
    setDraft(next?.kind === 'rename' ? next.name : '');
    setError(null);
  };

  const submitNew = async () => {
    if (busy) return;
    setBusy(true);
    const r = await useCategoryStore.getState().create(draft);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    // 추가하면 체크된 채 목록에 붙는다(5-12).
    setSelected((prev) => [...prev, r.category.name]);
    startEdit(null);
  };

  const submitRename = async (id: string, oldName: string) => {
    if (busy) return;
    if (norm(draft) === norm(oldName) && draft.trim() === oldName) {
      startEdit(null);
      return;
    }
    setBusy(true);
    const r = await renameCategoryEverywhere(id, oldName, draft);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const next = draft.trim();
    setSelected((prev) => prev.map((s) => (norm(s) === norm(oldName) ? next : s)));
    startEdit(null);
    if (r.failed > 0) void notice(`현장 ${r.failed}곳은 분류 이름을 바꾸지 못했어요`, '잠시 뒤에 그 현장의 분류를 다시 골라 주세요.');
  };

  const askDelete = async (id: string, name: string) => {
    if (busy) return;
    const n = countOf(name);
    const ok = await confirm({
      title: `'${name}' 분류를 삭제할까요?`,
      message: n > 0 ? `현장 ${n}곳에서 이 분류가 빠져요. 현장은 지워지지 않아요.` : '현장은 지워지지 않아요.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    const r = await deleteCategoryEverywhere(id, name);
    setBusy(false);
    if (!r.ok) {
      await notice('분류를 삭제하지 못했어요', r.error);
      return;
    }
    setSelected((prev) => prev.filter((s) => norm(s) !== norm(name)));
    if (r.failed > 0) void notice(`현장 ${r.failed}곳에서 분류를 빼지 못했어요`, '잠시 뒤에 그 현장의 분류를 다시 골라 주세요.');
  };

  const openMore = (anchor: View | null, id: string, name: string) =>
    showPopoverMenu(anchor, [
      { label: '이름 변경', icon: 'edit', onPress: () => startEdit({ kind: 'rename', id, name }) },
      { label: '삭제', icon: 'trash', tone: 'danger', onPress: () => void askDelete(id, name) },
    ]);

  const inputRow = (confirmLabel: string, onSubmit: () => void, helper: string | null) => (
    <View style={styles.editBlock}>
      <View style={styles.editRow}>
        <SheetTextInput
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (error) setError(null);
          }}
          autoFocus
          maxLength={64}
          placeholder="분류 이름"
          placeholderTextColor={c2.text.tertiary}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          style={[styles.input, error ? styles.inputError : null]}
        />
        <Button2 variant="secondary" size="M" onPress={() => startEdit(null)} style={styles.editBtn}>
          취소
        </Button2>
        <Button2 size="M" onPress={onSubmit} loading={busy} disabled={!draft.trim()} style={styles.editBtn}>
          {confirmLabel}
        </Button2>
      </View>
      {error ? (
        <FieldMessage message={error} />
      ) : helper ? (
        <Text v2="small.regular" tone="tertiary">
          {helper}
        </Text>
      ) : null}
    </View>
  );

  return (
    <AppSheet
      open={open}
      onClose={() => onClose(selected)}
      title="분류 선택"
      subtitle={`${placeName} · 여러 개 고를 수 있어요`}
      scrollable
      scrollToEndKey={editing?.kind === 'new' ? `new:${error ?? ''}` : null}
    >
      <View style={styles.list}>
        {rows.map((r, i) => {
          if (editing?.kind === 'rename' && editing.id === r.id) {
            const n = countOf(r.name);
            return (
              <SelectRow key={r.id} title={r.name} selected={isOn(r.name)} onPress={() => undefined} first={i === 0}>
                {inputRow('저장', () => void submitRename(r.id, r.name), n > 0 ? `현장 ${n}곳의 분류 이름도 함께 바뀌어요.` : null)}
              </SelectRow>
            );
          }
          return (
            <SelectRow
              key={r.id}
              title={r.name}
              subtitle={`현장 ${countOf(r.name)}곳`}
              selected={isOn(r.name)}
              onPress={() => toggle(r.name)}
              onMore={r.master ? (anchor) => openMore(anchor, r.id, r.name) : undefined}
              first={i === 0}
            />
          );
        })}
        <View style={rows.length > 0 ? styles.divider : null}>
          {editing?.kind === 'new' ? (
            inputRow('추가', () => void submitNew(), '추가하면 이 현장에 바로 붙어요.')
          ) : (
            <Touchable onPress={() => startEdit({ kind: 'new' })} accessibilityRole="button" style={styles.newRow}>
              <Icon name="plus" size={22} color={c2.text.link} />
              <Text v2="bodyM.bold" tone="link">
                새 분류 만들기
              </Text>
            </Touchable>
          )}
        </View>
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space[20] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  newRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  editBlock: { flex: 1, paddingVertical: space[10], gap: space[8] },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: space[14],
    borderRadius: radius2.lg,
    borderWidth: 2,
    borderColor: c2.border.brand,
    backgroundColor: c2.bg.canvas,
    fontFamily: fontFamily.regular,
    fontSize: type2['bodyL.regular'].fontSize,
    color: c2.text.primary,
  },
  inputError: { borderColor: c2.danger },
  editBtn: { paddingHorizontal: space[14] },
});

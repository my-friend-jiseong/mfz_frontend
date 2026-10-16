import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { SheetTextInput } from '@/components/ui/SheetTextInput';
import { SelectRow } from '@/components/ui/SelectRow';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { FieldMessage } from '@/components/ui/FormField2';
import { Icon } from '@/components/icons';
import { useProjectStore } from '@/stores/projectStore';
import { useFieldStore } from '@/stores/fieldStore';
import type { Field } from '@/types/entities';
import { c2, radius2, space, type2 } from '@/theme/v2';
import { fontFamily } from '@/theme/typography';

interface Props {
  open: boolean;
  onClose: () => void;
  field: Field;
  /** 부제 앞부분(현장 이름). */
  placeName: string;
}

/**
 * 5-3 프로젝트 변경 시트(하나만). 고르면 바로 저장하고 닫는다. '프로젝트 없음'은 소속을 뺀다.
 * '새 프로젝트 만들기'는 그리지 않은 흐름이라 5-12 새 분류와 같은 입력 줄로 만든다.
 */
export function ProjectSheet({ open, onClose, field, placeName }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const fields = useFieldStore((s) => s.fields);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreating(false);
    setError(null);
  }, [open]);

  const countById = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fields) if (f.projectId) m.set(f.projectId, (m.get(f.projectId) ?? 0) + 1);
    return m;
  }, [fields]);
  // 화면에 있는 내 현장으로 센다 — 방금 바꾼 소속이 바로 보인다. 현장 목록을 못 받았으면 서버 집계.
  const countOf = (id: string, server?: number) => (fields.length > 0 ? (countById.get(id) ?? 0) : (server ?? 0));

  const current = field.projectId ?? null;

  const choose = async (projectId: string | null) => {
    if (busy) return;
    if (projectId === current) {
      onClose();
      return;
    }
    setBusy(true);
    const r = await useFieldStore.getState().update(field.id, { projectId });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    // 서버 응답에 프로젝트 이름이 없을 수 있어 화면 값을 맞춘다.
    const name = projectId ? (projects.find((p) => p.id === projectId)?.name ?? null) : null;
    useFieldStore.setState((s) => ({
      fields: s.fields.map((f) => (f.id === field.id ? { ...f, projectId, projectName: name } : f)),
    }));
    onClose();
  };

  const submitNew = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    const r = await useProjectStore.getState().create({ name });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await choose(r.project.id);
  };

  return (
    <AppSheet open={open} onClose={onClose} title="프로젝트 변경" subtitle={`${placeName} · 현장은 프로젝트 하나에만 속해요`} scrollable>
      <View style={styles.list}>
        {projects.map((p, i) => (
          <SelectRow
            key={p.id}
            mode="radio"
            title={p.name}
            subtitle={`현장 ${countOf(p.id, p.fieldCount)}곳${p.id === current ? ' · 지금 속한 프로젝트' : ''}`}
            selected={p.id === current}
            onPress={() => void choose(p.id)}
            first={i === 0}
          />
        ))}
        <SelectRow mode="radio" title="프로젝트 없음" selected={current === null} onPress={() => void choose(null)} first={projects.length === 0} />
        <View style={styles.divider}>
          {creating ? (
            <View style={styles.editBlock}>
              <View style={styles.editRow}>
                <SheetTextInput
                  value={draft}
                  onChangeText={(v) => {
                    setDraft(v);
                    if (error) setError(null);
                  }}
                  autoFocus
                  maxLength={100}
                  placeholder="프로젝트 이름"
                  placeholderTextColor={c2.text.tertiary}
                  returnKeyType="done"
                  onSubmitEditing={() => void submitNew()}
                  style={[styles.input, error ? styles.inputError : null]}
                />
                <Button2 variant="secondary" size="M" onPress={() => setCreating(false)} style={styles.editBtn}>
                  취소
                </Button2>
                <Button2 size="M" onPress={() => void submitNew()} loading={busy} disabled={!draft.trim()} style={styles.editBtn}>
                  추가
                </Button2>
              </View>
              {error ? <FieldMessage message={error} /> : null}
            </View>
          ) : (
            <>
              <Touchable
                onPress={() => {
                  setDraft('');
                  setCreating(true);
                }}
                accessibilityRole="button"
                style={styles.newRow}
              >
                <Icon name="plus" size={22} color={c2.text.link} />
                <Text v2="bodyM.bold" tone="link">
                  새 프로젝트 만들기
                </Text>
              </Touchable>
              {error ? <FieldMessage message={error} /> : null}
            </>
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
  editBlock: { paddingVertical: space[10], gap: space[8] },
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

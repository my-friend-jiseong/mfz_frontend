import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight, touchTarget } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { opacity } from '@/theme/motion';

interface Props {
  value: string;
  /** 바뀐 값만 넘어온다(공백 제거 후). 실패하면 throw — 입력칸을 연 채로 남긴다. */
  onSubmit: (next: string) => Promise<void> | void;
  maxLength?: number;
  /** 스크린리더용 — "외근 제목" 등. */
  label: string;
}

/**
 * 탭해서 고치는 제목 (명세 v2 FE-WRAP-05, FE-RPT-08a).
 * 제목 자리가 입력칸(지우기 `×` 포함)으로 바뀌고 오른쪽에 `완료` 가 붙는다.
 * `완료`·키보드 완료 키·바깥 탭(blur) 시 저장. 빈 값이면 이전 제목으로 되돌린다.
 */
export function EditableTitle({ value, onSubmit, maxLength = 100, label }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  // 완료 버튼을 누르면 blur 도 같이 온다 — 저장이 두 번 나가지 않게.
  const committing = useRef(false);

  const begin = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = async () => {
    if (committing.current) return;
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    committing.current = true;
    setSaving(true);
    try {
      await onSubmit(next);
      setEditing(false);
    } catch {
      // 호출 측이 오류 안내를 띄운다. 입력칸은 남겨 다시 시도할 수 있게.
    } finally {
      setSaving(false);
      committing.current = false;
    }
  };

  if (!editing) {
    return (
      <Pressable
        onPress={begin}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint="눌러서 제목을 수정합니다"
        style={({ pressed }) => [styles.display, pressed && { opacity: opacity.pressed }]}
      >
        <Text variant="h2" numberOfLines={2}>
          {value}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.inputBox}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          selectTextOnFocus
          maxLength={maxLength}
          returnKeyType="done"
          onSubmitEditing={commit}
          onBlur={commit}
          editable={!saving}
          accessibilityLabel={label}
          style={styles.input}
        />
        {draft.length > 0 ? (
          <Pressable
            onPress={() => setDraft('')}
            accessibilityRole="button"
            accessibilityLabel="지우기"
            hitSlop={(touchTarget.control - 32) / 2}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={commit}
        accessibilityRole="button"
        accessibilityLabel="제목 수정 완료"
        disabled={saving}
        style={({ pressed }) => [styles.done, pressed && { opacity: opacity.pressed }]}
      >
        <Text variant="body" weight="bold" color="primary">
          완료
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  display: { minHeight: touchTarget.control, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  inputBox: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    paddingVertical: 0,
  },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  done: {
    minHeight: 48,
    minWidth: touchTarget.control,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

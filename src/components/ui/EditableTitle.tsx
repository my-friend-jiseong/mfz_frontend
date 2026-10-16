import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight, touchTarget } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { opacity } from '@/theme/motion';
import Svg, { Line } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { c2, space, type Type2 } from '@/theme/v2';

interface Props {
  value: string;
  /** 바뀐 값만 넘어온다(공백 제거 후). 실패하면 throw — 입력칸을 연 채로 남긴다. */
  onSubmit: (next: string) => Promise<void> | void;
  maxLength?: number;
  /** 스크린리더용 — "외근 제목" 등. */
  label: string;
  /**
   * 2차 표시 모양(3·5 제목): Title/L + 오른쪽 연필(18, 링크색). `'pencil-underline'` 은 제목 아래 점선 밑줄을 더한다
   * (결정 기록: 연필 + 점선 밑줄). 주지 않으면 기존 모양(h2) 그대로.
   */
  appearance?: 'pencil' | 'pencil-underline';
  /** 2차 제목 글자 스타일. 기본 title.l */
  v2?: Type2;
  /** 빈 값도 저장한다(서버가 기본 제목으로 채우는 경우 등). 기본은 빈 값이면 이전 제목으로 되돌린다. */
  allowEmpty?: boolean;
  /** 값이 비었을 때 보여 줄 글(allowEmpty 와 함께). */
  placeholder?: string;
}

/**
 * 탭해서 고치는 제목 (명세 v2 FE-WRAP-05, FE-RPT-08a).
 * 제목 자리가 입력칸(지우기 `×` 포함)으로 바뀌고 오른쪽에 `완료` 가 붙는다.
 * `완료`·키보드 완료 키·바깥 탭(blur) 시 저장. 빈 값이면 이전 제목으로 되돌린다.
 */
export function EditableTitle({
  value,
  onSubmit,
  maxLength = 100,
  label,
  appearance,
  v2 = 'title.l',
  allowEmpty,
  placeholder,
}: Props) {
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
    if ((!next && !allowEmpty) || next === value) {
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

  if (!editing && appearance) {
    const empty = value.trim().length === 0;
    return (
      <Pressable
        onPress={begin}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder || ''}`}
        accessibilityHint="눌러서 제목을 수정합니다"
        style={({ pressed }) => [styles.display2, pressed && { opacity: opacity.pressed }]}
      >
        <View style={styles.title2}>
          <Text v2={v2} tone={empty ? 'tertiary' : 'primary'} numberOfLines={2}>
            {empty ? placeholder ?? '' : value}
          </Text>
          {appearance === 'pencil-underline' ? <DottedUnderline /> : null}
        </View>
        <Icon name="edit" size={18} color={c2.text.link} />
      </Pressable>
    );
  }

  if (!editing) {
    return (
      <Pressable
        onPress={begin}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint="눌러서 제목을 수정합니다"
        style={({ pressed }) => [styles.display, pressed && { opacity: opacity.pressed }]}
      >
        <Text variant="h2" weight="heavy" numberOfLines={2}>
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

// 한쪽 테두리 dotted 는 Android 에서 실선·누락으로 나온다 — SVG 선 하나로 그린다. 폭은 제목 폭을 잰다.
function DottedUnderline() {
  const [w, setW] = useState(0);
  return (
    <View style={styles.underline} onLayout={(e) => setW(e.nativeEvent.layout.width)} pointerEvents="none">
      {w > 0 ? (
        <Svg width={w} height={2}>
          <Line x1={0} y1={1} x2={w} y2={1} stroke={c2.border.mutedStrong} strokeWidth={1.5} strokeDasharray="2 3" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  display: { minHeight: touchTarget.control, justifyContent: 'center' },
  display2: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[4] },
  title2: { flexShrink: 1 },
  underline: { height: 2, alignSelf: 'stretch' },
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

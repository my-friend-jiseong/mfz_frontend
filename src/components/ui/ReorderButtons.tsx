import React from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing, radius, touchTarget } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

interface Props {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}

const BTN_W = 32;
const BTN_H = 26;

/**
 * 순서 바꾸기 ▲▼ (명세 v2 FE-OUT-03a, FE-RPT-02a).
 * ▲ 는 앞 항목과, ▼ 는 뒤 항목과 자리를 바꾼다. 맨 위 ▲ · 맨 아래 ▼ 는 비활성.
 * 드래그를 쓰지 않는 이유: 지도 시트의 pan 제스처와 충돌하고 웹·스크린리더 대체 수단이 따로 필요하다.
 */
export function ReorderButtons({ index, count, onMove }: Props) {
  const first = index === 0;
  const last = index === count - 1;
  return (
    <View style={styles.col}>
      <Pressable
        onPress={() => onMove(index, index - 1)}
        disabled={first}
        accessibilityRole="button"
        accessibilityLabel="위로 이동"
        accessibilityState={{ disabled: first }}
        hitSlop={{ top: (touchTarget.control - BTN_H) / 2, bottom: 2, left: 6, right: 6 }}
        style={({ pressed }) => [styles.btn, first && styles.disabled, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="chevron-up" size={14} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => onMove(index, index + 1)}
        disabled={last}
        accessibilityRole="button"
        accessibilityLabel="아래로 이동"
        accessibilityState={{ disabled: last }}
        hitSlop={{ top: 2, bottom: (touchTarget.control - BTN_H) / 2, left: 6, right: 6 }}
        style={({ pressed }) => [styles.btn, last && styles.disabled, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="chevron-down" size={14} color={colors.text} />
      </Pressable>
    </View>
  );
}

/**
 * 행 전체에 거는 스크린리더 커스텀 액션. `increment`/`decrement` 는 슬라이더(adjustable) 의미라
 * 순서 이동에 쓰지 않는다.
 */
export function reorderA11yProps(index: number, count: number, onMove: (from: number, to: number) => void) {
  const actions = [
    ...(index > 0 ? [{ name: 'moveUp', label: '위로 이동' }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: '아래로 이동' }] : []),
  ];
  return {
    accessibilityActions: actions,
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'moveUp') onMove(index, index - 1);
      if (e.nativeEvent.actionName === 'moveDown') onMove(index, index + 1);
    },
  };
}

/** 두 칸을 맞바꾼 새 배열. 범위를 벗어나면 원본 그대로. */
export function swapAt<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

const styles = StyleSheet.create({
  col: { gap: spacing.xs },
  btn: {
    width: BTN_W,
    height: BTN_H,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: opacity.disabled },
});

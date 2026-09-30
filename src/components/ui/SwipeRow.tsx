import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { duration, opacity } from '@/theme/motion';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  /** 행이 열려 있는지 알려준다 — 열린 행을 탭하면 부모가 펼침 대신 닫기로 처리할 수 있게. */
  onOpenChange?: (open: boolean) => void;
}

const ACTION_W = 88;

/**
 * 왼쪽으로 밀면 빨간 `삭제` 가 드러나는 행 (명세 v2 FE-WRAP-03).
 *
 * RNGH `ReanimatedSwipeable` 을 쓰지 않는다 — Expo 54 / RN 0.81 / RNGH 2.28 / Reanimated 4.1 /
 * Fabric iOS 에서 스와이프 즉시 크래시하는 이슈(#3720)가 열려 있다. Pan 제스처를 JS 스레드에서
 * 받아(runOnJS) RN Animated 로 옮긴다: 한 행짜리 이동이라 성능 차이가 없고 워클릿 경로를 피한다.
 * 가로 10px 이상 움직여야 활성화, 세로 8px 먼저 움직이면 실패 → 목록 세로 스크롤을 뺏지 않는다.
 * 스와이프는 단축 동작이다. 같은 삭제가 방문 수정 화면에도 있고, 스크린리더는 커스텀 액션으로 쓴다.
 */
export function SwipeRow({ children, onDelete, deleteLabel = '삭제', onOpenChange }: Props) {
  const tx = useRef(new Animated.Value(0)).current;
  const base = useRef(0);
  const [open, setOpen] = useState(false);
  // 제스처는 한 번만 만든다 — 콜백은 ref 로 최신 값을 읽어 오래된 클로저를 부르지 않게.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const settle = (toOpen: boolean) => {
    base.current = toOpen ? -ACTION_W : 0;
    setOpen(toOpen);
    onOpenChangeRef.current?.(toOpen);
    Animated.timing(tx, {
      toValue: base.current,
      duration: duration.base,
      useNativeDriver: true,
    }).start();
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-10, 10])
        .failOffsetY([-8, 8])
        .onUpdate((e) => {
          const x = Math.min(0, Math.max(-ACTION_W * 1.2, base.current + e.translationX));
          tx.setValue(x);
        })
        .onEnd((e) => {
          const x = base.current + e.translationX;
          settle(x < -ACTION_W / 2 || e.velocityX < -500);
        }),
    // settle 이 참조하는 값은 ref·setState 뿐이라 첫 렌더의 settle 로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tx],
  );

  return (
    <View
      style={styles.wrap}
      accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') onDelete();
      }}
    >
      <View style={styles.actionSlot} importantForAccessibility="no-hide-descendants">
        <Pressable
          onPress={() => {
            settle(false);
            onDelete();
          }}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          style={({ pressed }) => [styles.action, pressed && { opacity: opacity.pressed }]}
        >
          <Text variant="bodySm" weight="semibold" color="onDanger">
            {deleteLabel}
          </Text>
        </Pressable>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={{ transform: [{ translateX: tx }] }}>
          {children}
          {/* 열려 있을 때 행을 탭하면 닫기만 한다(펼침·이동이 같이 일어나지 않게). */}
          {open ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => settle(false)}
              accessibilityLabel="삭제 버튼 닫기"
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  actionSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: ACTION_W,
  },
  action: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});

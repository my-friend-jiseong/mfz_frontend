import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
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

// 끌기가 끝난 직후의 탭을 무시하는 창. 손을 떼면 그 자리에서 press 가 완성되는데(웹 Pressable 은
// 누르기 시작할 때 응답자가 정해져 나중에 덮은 가림막이 못 막는다 — 실측), 그 press 를 행 안의
// 컨트롤이 스스로 거르게 한다.
const PRESS_GUARD_MS = 300;
const SwipeGuardContext = createContext<() => boolean>(() => false);

/** 행 안의 Pressable 이 onPress 첫 줄에서 부른다 — true 면 방금 스와이프한 것이니 무시. */
export function useSwipePressGuard(): () => boolean {
  return useContext(SwipeGuardContext);
}

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
  // 끄는 중 — 손을 뗄 때 이어지는 클릭(웹 click·네이티브 press)이 아래 카드의 onPress 로 새지 않게
  // 가림막을 덮는다. 실측(웹): 가림막 없이 끌면 삭제가 드러나면서 카드가 같이 펼쳐졌다.
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const lastDragEnd = useRef(0);
  const shouldIgnorePress = useMemo(
    () => () => draggingRef.current || Date.now() - lastDragEnd.current < PRESS_GUARD_MS,
    [],
  );
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
        .onStart(() => {
          draggingRef.current = true;
          setDragging(true);
        })
        .onUpdate((e) => {
          const x = Math.min(0, Math.max(-ACTION_W * 1.2, base.current + e.translationX));
          tx.setValue(x);
        })
        .onEnd((e) => {
          const x = base.current + e.translationX;
          settle(x < -ACTION_W / 2 || e.velocityX < -500);
        })
        // 클릭 이벤트는 pointerup 뒤에 온다 — 한 틱 늦게 걷어야 가림막이 그 클릭을 받는다.
        .onFinalize(() => {
          if (draggingRef.current) lastDragEnd.current = Date.now();
          draggingRef.current = false;
          setTimeout(() => setDragging(false), 50);
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
          <SwipeGuardContext.Provider value={shouldIgnorePress}>{children}</SwipeGuardContext.Provider>
          {/* 열려 있을 때 행을 탭하면 닫기만 한다(펼침·이동이 같이 일어나지 않게). */}
          {open || dragging ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (!dragging) settle(false);
              }}
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

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { duration } from '@/theme/motion';

export interface RecordMenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
}

interface Props {
  /** 연 '+' 버튼의 화면 위치(measureInWindow). null 이면 닫힘. */
  anchor: { x: number; y: number; w: number; h: number } | null;
  items: RecordMenuItem[];
  onClose: () => void;
}

// Figma 8-6(623:3155): 알약 52, 사이 8, 마지막 알약과 닫기 버튼 사이 18.
const PILL_H = 52;
const PILL_GAP = 8;
const PILL_TO_FAB = 18;
// iOS 는 떠 있는 Modal 위에 새 화면을 띄우지 못한다 — 닫힌 모달이 완전히 내려간 뒤에 이동한다(ConfirmDialog 와 같은 값).
const AFTER_CLOSE_MS = Platform.OS === 'ios' ? 350 : 0;

/**
 * 8-6 기록 메뉴 — 7 외근 진행의 '+' 를 누르면 화면을 어둡게 덮고, '+' 자리에 검은 닫기 버튼, 그 위로 알약 버튼을 쌓는다.
 * 탭 바까지 덮는다(Modal). 바깥을 누르면 아무것도 하지 않고 닫힌다.
 * 항목을 누르면 메뉴를 먼저 닫고, 사라지는 애니메이션과 Modal 내림이 끝난 뒤에 실행한다.
 */
export function RecordMenu({ anchor, items, onClose }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(anchor);
  // 닫힌 뒤 실행할 항목 동작.
  const pendingRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (anchor) setShown(anchor);
    Animated.timing(anim, { toValue: anchor ? 1 : 0, duration: duration.fast, useNativeDriver: true }).start(({ finished }) => {
      if (!finished || anchor) return;
      setShown(null);
      const fn = pendingRef.current;
      pendingRef.current = null;
      if (fn) timerRef.current = setTimeout(fn, AFTER_CLOSE_MS);
    });
  }, [anchor, anim]);
  // 내려간 뒤(외근 종료 등) 늦게 이동하지 않게.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!shown) return null;
  const fabBottomGap = PILL_TO_FAB;
  const pick = (fn: () => void) => {
    pendingRef.current = fn;
    onClose();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="메뉴 닫기" />
        <View
          pointerEvents="box-none"
          style={[styles.pills, { top: shown.y - fabBottomGap - items.length * PILL_H - (items.length - 1) * PILL_GAP, right: undefined, left: 0, width: shown.x + shown.w }]}
        >
          {items.map((it) => (
            <Touchable
              key={it.label}
              onPress={() => pick(it.onPress)}
              accessibilityRole="menuitem"
              accessibilityLabel={it.label}
              style={styles.pill}
            >
              <Icon name={it.icon} size={20} color={c2.text.link} />
              <Text v2="bodyL.bold">{it.label}</Text>
            </Touchable>
          ))}
        </View>
        <Touchable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="기록 메뉴 닫기"
          style={[styles.close, { left: shown.x, top: shown.y, width: shown.w, height: shown.h }]}
        >
          <Icon name="close" size={20} color={c2.text.inverse} />
        </Touchable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: c2.bg.menuScrim },
  pills: { position: 'absolute', alignItems: 'flex-end', gap: PILL_GAP },
  pill: {
    height: PILL_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingLeft: space[16],
    paddingRight: space[20],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    ...elevation2.menuPill,
  },
  close: {
    position: 'absolute',
    borderRadius: radius2.full,
    backgroundColor: c2.bg.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation2.control,
  },
});

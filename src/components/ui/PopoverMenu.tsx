import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { duration } from '@/theme/motion';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface PopoverItem {
  label: string;
  icon?: IconName;
  /** 삭제처럼 되돌릴 수 없는 항목 — 빨강. */
  tone?: 'default' | 'danger';
  onPress: () => void;
}

/** measureInWindow 를 가진 것(View ref) */
interface Measurable {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pending {
  anchor: Rect;
  items: PopoverItem[];
  width: number;
}

let open: ((p: Pending) => void) | null = null;

/**
 * ⋯·+ 버튼에 붙어 뜨는 메뉴(3-4·5-4·5-7·9-4). 버튼의 ref 를 넘기면 그 아래 오른쪽 끝에 맞춰 뜬다.
 * 아래 자리가 모자라면 버튼 위로 뜬다. 바깥을 누르면 아무것도 하지 않고 닫힌다.
 *   const moreRef = useRef<View>(null);
 *   <MapButton ref={moreRef} icon="more" accessibilityLabel="더보기"
 *     onPress={() => showPopoverMenu(moreRef.current, [{ label: '외근 삭제', icon: 'trash', tone: 'danger', onPress }])} />
 * width 는 메뉴마다 Figma 값이 다르다: 기본 202(3-4·5-7), 9-4 는 216, 5-4 는 238.
 */
export function showPopoverMenu(anchor: Measurable | null, items: PopoverItem[], opts?: { width?: number }) {
  if (!anchor || !open) return;
  const width = opts?.width ?? MENU_W;
  anchor.measureInWindow((x, y, w, h) => open?.({ anchor: { x, y, w, h }, items, width }));
}

const MENU_W = 202;
const ITEM_H = 52;
const EDGE = 12;
const GAP = 4;
const AFTER_CLOSE_MS = Platform.OS === 'ios' ? 350 : 0;

export function PopoverMenuHost() {
  const { width: winW, height: winH } = useWindowDimensions();
  const [pending, setPending] = useState<Pending | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    open = (p) => {
      closing.current = false;
      setPending(p);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: duration.fast, useNativeDriver: true }).start();
    };
    return () => {
      open = null;
    };
  }, [anim]);

  const close = useCallback(
    (then?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      Animated.timing(anim, { toValue: 0, duration: duration.fast, useNativeDriver: true }).start(() => {
        closing.current = false;
        setPending(null);
        if (then) setTimeout(then, AFTER_CLOSE_MS);
      });
    },
    [anim],
  );

  if (!pending) return null;
  const { anchor, items, width } = pending;
  const menuH = items.length * ITEM_H + space[8] + 2;
  const right = Math.max(EDGE, winW - (anchor.x + anchor.w));
  const below = anchor.y + anchor.h + GAP;
  const top = below + menuH > winH - EDGE ? Math.max(EDGE, anchor.y - GAP - menuH) : below;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={() => close()}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="메뉴 닫기" />
      <Animated.View
        accessibilityRole="menu"
        style={[
          styles.menu,
          {
            top,
            right,
            width,
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          },
        ]}
      >
        {items.map((it, i) => {
          const danger = it.tone === 'danger';
          return (
            <View key={`${it.label}-${i}`} style={i > 0 && styles.divider}>
              <Touchable
                onPress={() => close(it.onPress)}
                accessibilityRole="menuitem"
                style={styles.item}
              >
                {it.icon ? <Icon name={it.icon} size={20} color={danger ? c2.text.danger : c2.text.primary} /> : null}
                <Text v2="bodyL.semibold" tone={danger ? 'danger' : 'primary'} numberOfLines={1}>
                  {it.label}
                </Text>
              </Touchable>
            </View>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    paddingVertical: space[4],
    borderRadius: radius2.lg,
    borderWidth: 1,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
    ...elevation2.popover,
  },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  item: { height: ITEM_H, flexDirection: 'row', alignItems: 'center', gap: space[12], paddingHorizontal: space[16] },
});

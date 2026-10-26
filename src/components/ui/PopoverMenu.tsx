import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { animEasing, duration, useReducedMotionPref } from '@/theme/motion';
import { Text } from './Text';
import { OverlayModal } from './OverlayModal';
import { Touchable } from './Touchable';
import { measureForOverlay, type Measurable } from '@/utils/measureForOverlay';

export interface PopoverItem {
  label: string;
  icon?: IconName;
  /** 삭제처럼 되돌릴 수 없는 항목 — 빨강. */
  tone?: 'default' | 'danger';
  onPress: () => void;
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
  dim: boolean;
  onClose?: () => void;
}

export interface PopoverOptions {
  width?: number;
  /** 뒤를 아주 옅게 어둡게(9-4). 3-4·5-4·5-7 은 어둡게 하지 않는다. */
  dim?: boolean;
  /** 메뉴가 닫히기 시작할 때(항목을 골랐거나 바깥을 눌렀을 때) — 여는 버튼의 '열림' 모양을 끄는 데 쓴다. */
  onClose?: () => void;
}

let open: ((p: Pending) => void) | null = null;

/**
 * ⋯·+ 버튼에 붙어 뜨는 메뉴(3-4·5-4·5-7·9-4). 버튼의 ref 를 넘기면 그 아래 오른쪽 끝에 맞춰 뜬다.
 * 아래 자리가 모자라면 버튼 위로 뜬다. 바깥을 누르면 아무것도 하지 않고 닫힌다.
 *   const moreRef = useRef<View>(null);
 *   <MapButton ref={moreRef} icon="more" accessibilityLabel="더보기"
 *     onPress={() => showPopoverMenu(moreRef.current, [{ label: '외근 삭제', icon: 'trash', tone: 'danger', onPress }])} />
 * width 는 메뉴마다 Figma 값이 다르다: 기본 202(3-4·5-7), 9-4 는 216, 5-4 는 238.
 * 9-4 만 뒤를 옅게 어둡게(dim) 하고 ⋯ 버튼에 회색 원을 둔다(onClose 로 끈다). 3-4·5-4 Figma 엔 둘 다 없다.
 */
export function showPopoverMenu(anchor: Measurable | null, items: PopoverItem[], opts?: PopoverOptions) {
  if (!anchor || !open) {
    opts?.onClose?.();
    return;
  }
  const width = opts?.width ?? MENU_W;
  measureForOverlay(anchor, (x, y, w, h) =>
    open?.({ anchor: { x, y, w, h }, items, width, dim: !!opts?.dim, onClose: opts?.onClose }),
  );
}

const MENU_W = 202;
const ITEM_H = 52;
const EDGE = 12;
const GAP = 4;

export function PopoverMenuHost() {
  const { width: winW, height: winH } = useWindowDimensions();
  const [pending, setPending] = useState<Pending | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const pendingRef = useRef<Pending | null>(null);
  const reduced = useReducedMotionPref();
  const dur = reduced ? duration.instant : duration.fast;

  useEffect(() => {
    open = (p) => {
      closing.current = false;
      // 앞 메뉴가 떠 있었으면 그 버튼의 '열림' 모양도 끈다.
      pendingRef.current?.onClose?.();
      pendingRef.current = p;
      setPending(p);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: dur, easing: animEasing.enter, useNativeDriver: true }).start();
    };
    return () => {
      open = null;
    };
  }, [anim, dur]);

  const close = useCallback(
    (then?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      const closingPending = pendingRef.current;
      closingPending?.onClose?.();
      pendingRef.current = null;
      Animated.timing(anim, { toValue: 0, duration: dur, easing: animEasing.exit, useNativeDriver: true }).start(({ finished }) => {
        // 닫히는 사이 새 메뉴가 열렸으면(애니메이션이 끊김) 새 메뉴를 지우지 않는다.
        if (!finished) return;
        closing.current = false;
        setPending((cur) => (cur === closingPending ? null : cur));
        // iOS 도 OverlayModal 이 View 라 내려가길 기다릴 필요가 없다 — 다음 틱에 실행(확인 창이 바로 뜬다).
        if (then) setTimeout(then, 0);
      });
    },
    [anim, dur],
  );

  if (!pending) return null;
  const { anchor, items, width } = pending;
  const menuH = items.length * ITEM_H + space[8] + 2;
  // 버튼 오른쪽 끝에 맞추되, 왼쪽 끝 버튼(9-8 방문 사진 첫 칸)이면 메뉴가 화면 왼쪽 밖으로 나가지 않게 민다.
  const right = Math.min(Math.max(EDGE, winW - (anchor.x + anchor.w)), Math.max(EDGE, winW - width - EDGE));
  const below = anchor.y + anchor.h + GAP;
  const top = below + menuH > winH - EDGE ? Math.max(EDGE, anchor.y - GAP - menuH) : below;

  return (
    <OverlayModal visible onRequestClose={() => close()}>
      {pending.dim ? <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: anim }]} pointerEvents="none" /> : null}
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
            transform: reduced ? [] : [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
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
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: c2.bg.popoverScrim },
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

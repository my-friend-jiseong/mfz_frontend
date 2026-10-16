import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { BOTTOM_ACTION_BAR_HEIGHT } from './BottomActionBar';
import { Text } from './Text';
import { Touchable } from './Touchable';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { duration } from '@/theme/motion';

export interface SnackbarOptions {
  message: string;
  /** 버튼은 최대 하나(다시 시도·되돌리기·체크인). 누르면 스낵바가 바로 닫힌다. */
  action?: { label: string; onPress: () => void };
  /** 보이는 시간(ms). 기본: 버튼이 있으면 4000, 없으면 2000. */
  duration?: number;
  /**
   * 화면 바닥에서 띄울 거리(safe area 제외). 기본은 탭 바·하단 액션 바를 비키는 값.
   * 미니 바(7-4)나 외근 진행 시트(7-9)처럼 더 높이 떠야 하면 화면이 넘긴다.
   */
  bottomOffset?: number;
}

interface Item extends SnackbarOptions {
  id: number;
}

// 탭 바(56) 위. 탭 루트 중 하단 바가 있는 곳은 그 위까지 비킨다(기존 Toast 규칙 유지).
const TAB_BAR_H = 56;
const ROOTS_WITH_BAR = new Set(['trips', 'fields']);
function useDefaultClearance(): number {
  const segments = useSegments() as string[];
  const tabRoot = segments[0] === '(tabs)' && segments.length <= 2;
  if (!tabRoot) return BOTTOM_ACTION_BAR_HEIGHT + space[8];
  return TAB_BAR_H + (ROOTS_WITH_BAR.has(segments[1] ?? 'trips') ? BOTTOM_ACTION_BAR_HEIGHT + space[8] : space[24]);
}

let showFn: ((item: Item) => void) | null = null;
let hideFn: (() => void) | null = null;
let seq = 0;

/**
 * 2차 스낵바(Figma Snackbar 534:1249). 진행 알림에만 쓴다 — 오류·연결 상태는 화면 안 경고 줄(인수인계 v76·v134).
 * 호스트가 없으면 조용히 버린다(부가 피드백이라 흐름을 막지 않는다).
 */
export const snackbar = {
  show(opts: SnackbarOptions) {
    showFn?.({ ...opts, id: ++seq });
  },
  hide() {
    hideFn?.();
  },
};

/** 앱 루트에 1회 마운트. 화면 전환 직후 호출해도 살아남도록 스택 밖에 둔다. */
export function SnackbarHost() {
  const insets = useSafeAreaInsets();
  const clearance = useDefaultClearance();
  const [item, setItem] = useState<Item | null>(null);
  // 사라지는 중(페이드아웃)인 스낵바 id — 그동안은 버튼을 다시 못 누르게 터치를 끈다.
  const [hidingId, setHidingId] = useState<number | null>(null);
  // 버튼은 스낵바 하나당 한 번만(되돌리기 두 번 = 서버 요청 두 번).
  const firedId = useRef<number | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = useRef<number | null>(null);

  useEffect(() => {
    const hide = (id?: number) => {
      if (timer.current) clearTimeout(timer.current);
      setHidingId(id ?? currentId.current);
      Animated.timing(anim, { toValue: 0, duration: duration.base, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setItem((cur) => (id == null || cur?.id === id ? null : cur));
      });
    };
    showFn = (next) => {
      if (timer.current) clearTimeout(timer.current);
      currentId.current = next.id;
      setHidingId(null);
      setItem(next);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: duration.base, useNativeDriver: true }).start();
      AccessibilityInfo.announceForAccessibility?.(next.message);
      const ms = next.duration ?? (next.action ? 4000 : 2000);
      timer.current = setTimeout(() => hide(next.id), ms);
    };
    hideFn = () => hide();
    return () => {
      showFn = null;
      hideFn = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [anim]);

  if (!item) return null;
  const interactive = !!item.action && hidingId !== item.id;
  const bottom = insets.bottom + (item.bottomOffset ?? clearance);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      {/* 버튼 없는 스낵바는 아래 화면 터치를 막지 않는다. 읽어 주기는 announceForAccessibility 하나로만. */}
      <Animated.View
        accessibilityRole="alert"
        pointerEvents={interactive ? 'auto' : 'none'}
        style={[
          styles.bar,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [space[8], 0] }) }],
          },
        ]}
      >
        <Text v2="bodyS.regular" tone="inverse" style={styles.message} numberOfLines={2}>
          {item.message}
        </Text>
        {item.action ? (
          <Touchable
            onPress={() => {
              if (firedId.current === item.id) return;
              firedId.current = item.id;
              const a = item.action;
              snackbar.hide();
              a?.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={item.action.label}
            style={styles.action}
          >
            <Text v2="bodyM.bold" tone="inverseAccent">
              {item.action.label}
            </Text>
          </Touchable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space[12], right: space[12] },
  bar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingVertical: space[8],
    paddingLeft: space[16],
    paddingRight: space[12],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.inverse,
    ...elevation2.snackbar,
  },
  message: { flex: 1 },
  action: {
    height: 44,
    justifyContent: 'center',
    paddingLeft: space[12],
    paddingRight: space[4],
  },
});

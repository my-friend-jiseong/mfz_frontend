import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { BOTTOM_ACTION_BAR_HEIGHT } from './BottomActionBar';
import { useBottomChromeStore } from '@/stores/bottomChromeStore';
import { Text } from './Text';
import { Touchable } from './Touchable';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { animEasing, duration, useReducedMotionPref } from '@/theme/motion';

export interface SnackbarOptions {
  message: string;
  /** 버튼은 최대 하나(다시 시도·되돌리기·체크인). 누르면 스낵바가 바로 닫힌다. */
  action?: { label: string; onPress: () => void };
  /** 보이는 시간(ms). 기본: 버튼이 있으면 4000, 없으면 2000. */
  duration?: number;
  /**
   * 화면 바닥에서 띄울 거리(safe area 제외). 기본은 탭 바·미니 바(7-4)·하단 액션 바를 비키는 값.
   * 외근 진행 시트(7-9)처럼 더 높이 떠야 하면 화면이 넘긴다.
   */
  bottomOffset?: number;
  /**
   * 이 스낵바가 화면에서 완전히 사라진 뒤 한 번 부른다 — 사라지는 애니메이션이 끝났을 때, 또는 다른 스낵바로
   * 바뀌었을 때. 스낵바를 비키던 것(7 지도 버튼)을 사라진 뒤에 내리는 데 쓴다.
   */
  onHidden?: () => void;
}

interface Item extends SnackbarOptions {
  id: number;
}

// 기본 위치: 탭 화면이면 탭 바·미니 바(7-4)·하단 버튼 바를 모두 비킨 위, 그 밖(모달·로그인)은 화면 하단 버튼 바 위.
// 탭 쪽 높이는 셸이 bottomChromeStore 에 실측해 넣는다(safe area 포함). 반환값은 화면 바닥에서의 거리.
function useDefaultBottom(): number {
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const { tabBar, miniBar, footer } = useBottomChromeStore();
  if (segments[0] === '(tabs)' && tabBar > 0) return tabBar + miniBar + footer + space[8];
  return insets.bottom + BOTTOM_ACTION_BAR_HEIGHT + space[8];
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
  const defaultBottom = useDefaultBottom();
  const reduced = useReducedMotionPref();
  const [item, setItem] = useState<Item | null>(null);
  const itemRef = useRef<Item | null>(null);
  itemRef.current = item;
  // 사라지는 중(페이드아웃)인 스낵바 id — 그동안은 버튼을 다시 못 누르게 터치를 끈다.
  const [hidingId, setHidingIdState] = useState<number | null>(null);
  const hidingRef = useRef<number | null>(null);
  const setHidingId = (id: number | null) => {
    hidingRef.current = id;
    setHidingIdState(id);
  };
  // 버튼은 스낵바 하나당 한 번만(되돌리기 두 번 = 서버 요청 두 번).
  const firedId = useRef<number | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  // 떠 있는 동안 스낵바가 바뀌면 바 전체가 아니라 글자만 바꿔 낀다.
  const textAnim = useRef(new Animated.Value(1)).current;
  // 바닥에서의 높이. 떠 있는 동안 위치가 바뀌면(모달 → 탭, 미니 바 등장) 순간이동하지 않고 미끄러진다.
  const lift = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = useRef<number | null>(null);
  // onHidden 을 아직 부르지 않은 스낵바.
  const notifyRef = useRef<Item | null>(null);

  useEffect(() => {
    const notifyHidden = () => {
      const n = notifyRef.current;
      notifyRef.current = null;
      n?.onHidden?.();
    };
    const hide = (id?: number) => {
      if (timer.current) clearTimeout(timer.current);
      setHidingId(id ?? currentId.current);
      Animated.timing(anim, {
        toValue: 0,
        duration: reduced ? duration.instant : duration.base,
        easing: animEasing.exit,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        if (id != null && currentId.current !== id) return;
        placed.current = false;
        setItem(null);
        notifyHidden();
      });
    };
    showFn = (next) => {
      if (timer.current) clearTimeout(timer.current);
      const prev = itemRef.current;
      const replacing = prev != null;
      // 앞 스낵바는 이걸로 끝났다.
      notifyHidden();
      notifyRef.current = next;
      currentId.current = next.id;
      // 바꿔 끼는 동안(글자가 흐려지는 사이) 앞 스낵바의 버튼은 바로 못 누르게.
      setHidingId(replacing ? prev.id : null);
      if (replacing) {
        // 떠 있던(또는 사라지던) 바는 그대로 두고 글자만 짧게 바꿔 낀다.
        anim.stopAnimation();
        Animated.timing(anim, { toValue: 1, duration: duration.instant, easing: animEasing.enter, useNativeDriver: true }).start();
        Animated.timing(textAnim, { toValue: 0, duration: duration.instant, easing: animEasing.exit, useNativeDriver: true }).start(({ finished }) => {
          // 그사이 또 바뀌었거나 이 스낵바가 이미 닫히는 중이면 끼우지 않는다.
          if (!finished || currentId.current !== next.id || hidingRef.current === next.id) return;
          setHidingId(null);
          setItem(next);
          Animated.timing(textAnim, { toValue: 1, duration: duration.instant, easing: animEasing.enter, useNativeDriver: true }).start();
        });
      } else {
        placed.current = false;
        textAnim.setValue(1);
        setItem(next);
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: reduced ? duration.instant : duration.base,
          easing: animEasing.enter,
          useNativeDriver: true,
        }).start();
      }
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
  }, [anim, textAnim, reduced]);

  const bottom = item ? (item.bottomOffset != null ? insets.bottom + item.bottomOffset : defaultBottom) : null;
  useEffect(() => {
    if (bottom == null) return;
    if (!placed.current || reduced) {
      placed.current = true;
      lift.setValue(bottom);
      return;
    }
    Animated.timing(lift, { toValue: bottom, duration: duration.base, easing: animEasing.standard, useNativeDriver: true }).start();
  }, [bottom, lift, reduced]);

  if (!item || bottom == null) return null;
  const interactive = !!item.action && hidingId !== item.id;

  return (
    <Animated.View
      pointerEvents="box-none"
      // 첫 프레임은 아직 lift 가 옛 값일 수 있다 — 그때는 투명(anim 0)이라 보이지 않는다.
      style={[styles.wrap, { transform: [{ translateY: Animated.multiply(lift, -1) }] }]}
    >
      {/* 버튼 없는 스낵바는 아래 화면 터치를 막지 않는다. 읽어 주기는 announceForAccessibility 하나로만. */}
      <Animated.View
        accessibilityRole="alert"
        pointerEvents={interactive ? 'auto' : 'none'}
        style={[
          styles.bar,
          {
            opacity: anim,
            transform: reduced ? [] : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [space[8], 0] }) }],
          },
        ]}
      >
        <Animated.View style={[styles.content, { opacity: textAnim }]}>
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
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space[12], right: space[12], bottom: 0 },
  bar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space[8],
    paddingLeft: space[16],
    paddingRight: space[12],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.inverse,
    ...elevation2.snackbar,
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[8] },
  message: { flex: 1 },
  action: {
    height: 44,
    justifyContent: 'center',
    paddingLeft: space[12],
    paddingRight: space[4],
  },
});

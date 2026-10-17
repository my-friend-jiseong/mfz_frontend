import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { c2, elevation2, radius2 } from '@/theme/v2';

// 꾹 누르기(ms). 이보다 먼저 손가락이 움직이면 끌기가 아니라 스크롤이다.
const LONG_PRESS_MS = 350;
// 화면 끝에서 이 거리 안으로 끌면 목록을 굴린다(px). 끝에 가까울수록 빠르다.
const EDGE = 56;
const MAX_SPEED = 14;
const SETTLE_MS = 160;

/**
 * 끌어서 순서를 바꾸는 목록이 들어 있는 스크롤 뷰 연결. 반환값을 스크롤 뷰 props 에 펼친다.
 * 끌다가 위·아래 끝에 닿으면 목록을 굴리려고 스크롤 위치·크기를 안다.
 */
export function useSortableScroll() {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const contentH = useRef(0);
  // 끄는 동안은 굴리기가 offset 을 직접 쥔다 — 늦게 오는 onScroll(네이티브 gorhom 은 runOnJS)이 덮어쓰면 줄이 튄다.
  const dragging = useRef(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragging.current) offset.current = e.nativeEvent.contentOffset.y;
  }, []);
  const onContentSizeChange = useCallback((_w: number, h: number) => {
    contentH.current = h;
  }, []);
  return useMemo(
    () => ({ props: { ref, onScroll, onContentSizeChange, scrollEventThrottle: 16 }, ref, offset, contentH, dragging }),
    [onScroll, onContentSizeChange],
  );
}
export type SortableScroll = ReturnType<typeof useSortableScroll>;

interface Props<T> {
  data: T[];
  keyOf: (item: T) => string;
  /** 모든 줄은 같은 높이다(번호·두 줄 글자). */
  rowHeight: number;
  enabled?: boolean;
  /**
   * index 는 끄는 동안의 순서를 따른다(번호가 바로 바뀐다).
   * prev: 그 순서에서 바로 앞 줄.
   * justDropped: 방금 놓았으면 true — 줄 안 버튼은 이때 누름을 무시한다(웹은 손을 뗀 자리의 버튼이 눌린다).
   */
  renderRow: (
    item: T,
    index: number,
    state: { active: boolean; prev: T | null; justDropped: () => boolean },
  ) => React.ReactNode;
  onReorder: (keys: string[]) => void;
  scroll?: SortableScroll;
  /** 화면 아래를 덮는 것(하단 버튼 줄)의 높이 — 그 위에서부터 굴린다. */
  bottomInset?: number;
  /** 보이는 영역의 바닥을 정하는 바깥 뷰(화면 루트). 접힌 시트는 스크롤 뷰 아래쪽이 이 밖에 있다. */
  clipRef?: React.RefObject<View | null>;
  /** 줄 사이 선. 줄이 움직여도 자리에 남는다. */
  dividerStyle?: object;
}

/**
 * 꾹 눌러 들어 올린 뒤 위아래로 끌어 순서를 바꾸는 목록(6 외근 준비).
 * 줄은 순서와 상관없이 key 로 자리(positions)를 갖고 절대 위치로 그린다 — 놓은 뒤 React 가 새 순서로
 * 다시 그려도 자리가 같아 튀지 않는다. 끌기는 UI 스레드(shared value), 끝에서 굴리기는 JS 스레드에서 한다.
 */
export function SortableList<T>({
  data,
  keyOf,
  rowHeight,
  enabled = true,
  renderRow,
  onReorder,
  scroll,
  bottomInset = 0,
  clipRef,
  dividerStyle,
}: Props<T>) {
  const keys = useMemo(() => data.map(keyOf), [data, keyOf]);
  const keySig = keys.join('|');
  const positions = useSharedValue<Record<string, number>>(Object.fromEntries(keys.map((k, i) => [k, i])));
  const activeKey = useSharedValue<string | null>(null);
  const startIndex = useSharedValue(0);
  const dragY = useSharedValue(0);
  const scrollDelta = useSharedValue(0);
  const count = useSharedValue(keys.length);
  // 끄는 동안의 순서(번호·거리 글자를 바로 바꾼다). 놓으면 data 가 따라온다.
  const [preview, setPreview] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    positions.value = Object.fromEntries(keys.map((k, i) => [k, i]));
    count.value = keys.length;
    setPreview(null);
    // 끌던 줄이 사라졌으면(다른 곳에서 빠짐) 끌기를 접는다.
    const a = activeKey.value;
    if (a != null && !keys.includes(a)) {
      activeKey.value = null;
      dragging.current = false;
      if (scroll) scroll.dragging.current = false;
      stopAuto();
      setActiveId(null);
    }
    // keySig 가 keys 를 대표한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  // === 끝에서 굴리기(JS) ===
  const pointerY = useRef(0);
  const viewport = useRef<{ top: number; bottom: number; height: number } | null>(null);
  const scrollStart = useRef(0);
  const liftY = useRef(0);
  const armed = useRef(false);
  const raf = useRef<number | null>(null);
  const dragging = useRef(false);
  const stopAuto = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  const tick = useCallback(() => {
    const vp = viewport.current;
    const sv = scroll?.ref.current;
    if (!dragging.current || !vp || !sv || !scroll) {
      raf.current = null;
      return;
    }
    const y = pointerY.current;
    // 끝 가까이에서 들어 올리자마자 굴러가지 않게 — 조금이라도 끈 뒤부터.
    if (Math.abs(y - liftY.current) > 8) armed.current = true;
    let speed = 0;
    if (!armed.current) {
      raf.current = requestAnimationFrame(tick);
      return;
    }
    if (y < vp.top + EDGE) speed = -MAX_SPEED * Math.min(1, (vp.top + EDGE - y) / EDGE);
    else if (y > vp.bottom - EDGE) speed = MAX_SPEED * Math.min(1, (y - (vp.bottom - EDGE)) / EDGE);
    if (speed !== 0) {
      const max = Math.max(0, scroll.contentH.current - vp.height);
      const next = Math.min(max, Math.max(0, scroll.offset.current + speed));
      if (next !== scroll.offset.current) {
        scroll.offset.current = next;
        sv.scrollTo({ y: next, animated: false });
        scrollDelta.value = next - scrollStart.current;
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, [scroll, scrollDelta]);

  const onLift = useCallback(
    (key: string, absY: number) => {
      setActiveId(key);
      pointerY.current = absY;
      liftY.current = absY;
      armed.current = false;
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const sv = scroll?.ref.current;
      if (!sv || !scroll) return;
      scrollStart.current = scroll.offset.current;
      scrollDelta.value = 0;
      viewport.current = null;
      dragging.current = true;
      scroll.dragging.current = true;
      // 재기는 비동기다 — 그사이 놓았으면 굴리기를 시작하지 않는다.
      const start = (top: number, h: number, clipBottom: number) => {
        if (!dragging.current) return;
        viewport.current = { top, bottom: Math.min(top + h, clipBottom) - bottomInset, height: h };
        stopAuto();
        raf.current = requestAnimationFrame(tick);
      };
      (sv as unknown as View).measureInWindow((_x, y, _w, h) => {
        const clip = clipRef?.current;
        // 접힌 시트는 스크롤 뷰 아래쪽이 화면 밖이다 — 바깥 뷰 바닥으로 자른다.
        if (clip) clip.measureInWindow((_cx, cy, _cw, ch) => start(y, h, cy + ch));
        else start(y, h, Platform.OS === 'web' ? window.innerHeight : Number.POSITIVE_INFINITY);
      });
    },
    [scroll, scrollDelta, bottomInset, clipRef, stopAuto, tick],
  );
  const onMove = useCallback((absY: number) => {
    pointerY.current = absY;
  }, []);
  const onSlot = useCallback((order: string[]) => {
    setPreview(order);
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
  }, []);
  // 놓은 직후의 탭(웹은 손을 뗀 자리의 버튼이 눌린다)을 막는다.
  const droppedAt = useRef(0);
  const onDrop = useCallback(
    (order: string[], changed: boolean) => {
      dragging.current = false;
      if (scroll) scroll.dragging.current = false;
      stopAuto();
      droppedAt.current = Date.now();
      if (changed) onReorder(order);
      else setPreview(null);
    },
    [onReorder, scroll, stopAuto],
  );
  const onSettled = useCallback(() => setActiveId(null), []);
  const justDropped = useCallback(() => Date.now() - droppedAt.current < 400, []);
  useEffect(() => stopAuto, [stopAuto]);

  // 끄는 줄 자리가 바뀌면 다른 줄을 밀어낸다.
  useAnimatedReaction(
    () => (activeKey.value == null ? null : startIndex.value * rowHeight + dragY.value + scrollDelta.value),
    (y) => {
      const key = activeKey.value;
      if (y == null || key == null) return;
      const n = count.value;
      const to = Math.min(n - 1, Math.max(0, Math.round(y / rowHeight)));
      const pos = positions.value;
      if (pos[key] === undefined) {
        activeKey.value = null;
        return;
      }
      if (pos[key] === to) return;
      const order = Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
      order.splice(pos[key], 1);
      order.splice(to, 0, key);
      const next: Record<string, number> = {};
      order.forEach((k, i) => {
        next[k] = i;
      });
      positions.value = next;
      runOnJS(onSlot)(order);
    },
  );

  const order = preview ?? keys;
  const byKey = useMemo(() => new Map(data.map((d) => [keyOf(d), d])), [data, keyOf]);
  return (
    <View style={{ height: keys.length * rowHeight }}>
      {keys.slice(1).map((k, i) => (
        <View key={`sep-${k}`} style={[styles.sep, { top: (i + 1) * rowHeight }, dividerStyle]} />
      ))}
      {keys.map((k, i) => {
        const item = byKey.get(k);
        if (item === undefined) return null;
        const at = Math.max(0, order.indexOf(k));
        return (
          <SortableRow
            key={k}
            id={k}
            rowHeight={rowHeight}
            enabled={enabled && keys.length > 1}
            active={activeId === k}
            positions={positions}
            activeKey={activeKey}
            startIndex={startIndex}
            dragY={dragY}
            scrollDelta={scrollDelta}
            onLift={onLift}
            onMove={onMove}
            onDrop={onDrop}
            onSettled={onSettled}
            initialOrder={keys}
            index={i}
          >
            {renderRow(item, at, { active: activeId === k, prev: at > 0 ? byKey.get(order[at - 1]) ?? null : null, justDropped })}
          </SortableRow>
        );
      })}
    </View>
  );
}

function SortableRow({
  id,
  rowHeight,
  enabled,
  active,
  positions,
  activeKey,
  startIndex,
  dragY,
  scrollDelta,
  onLift,
  onMove,
  onDrop,
  onSettled,
  initialOrder,
  index,
  children,
}: {
  id: string;
  rowHeight: number;
  enabled: boolean;
  active: boolean;
  positions: SharedValue<Record<string, number>>;
  activeKey: SharedValue<string | null>;
  startIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  scrollDelta: SharedValue<number>;
  onLift: (key: string, absY: number) => void;
  onMove: (absY: number) => void;
  onDrop: (order: string[], changed: boolean) => void;
  onSettled: () => void;
  initialOrder: string[];
  /** 자리를 아직 못 받은 새 줄(담은 직후)의 자리. */
  index: number;
  children: React.ReactNode;
}) {
  const lifted = useSharedValue(0);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart((e) => {
          startIndex.value = positions.value[id] ?? index;
          dragY.value = 0;
          scrollDelta.value = 0;
          activeKey.value = id;
          lifted.value = withTiming(1, { duration: 120 });
          runOnJS(onLift)(id, e.absoluteY);
        })
        .onUpdate((e) => {
          dragY.value = e.translationY;
          runOnJS(onMove)(e.absoluteY);
        })
        .onFinalize(() => {
          if (activeKey.value !== id) return;
          const pos = positions.value;
          const order = Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
          const changed = order.some((k, i) => initialOrder[i] !== k);
          runOnJS(onDrop)(order, changed);
          lifted.value = withTiming(0, { duration: SETTLE_MS });
          // 끄던 줄을 새 자리로 내려놓은 뒤 들기를 푼다.
          const target = (pos[id] ?? index) * rowHeight - startIndex.value * rowHeight - scrollDelta.value;
          dragY.value = withTiming(target, { duration: SETTLE_MS }, (done) => {
            if (!done) return;
            if (activeKey.value === id) activeKey.value = null;
            runOnJS(onSettled)();
          });
        }),
    [enabled, id, index, rowHeight, initialOrder, positions, activeKey, startIndex, dragY, scrollDelta, lifted, onLift, onMove, onDrop, onSettled],
  );

  const style = useAnimatedStyle(() => {
    const isActive = activeKey.value === id;
    const y = isActive
      ? startIndex.value * rowHeight + dragY.value + scrollDelta.value
      : withTiming((positions.value[id] ?? index) * rowHeight, { duration: SETTLE_MS });
    return {
      transform: [{ translateY: y }, { scale: 1 + 0.03 * lifted.value }],
      zIndex: isActive ? 10 : 0,
    };
  });

  return (
    // 웹 터치: 줄 위를 쓸면 목록이 스크롤되게(기본 none 이면 모바일 브라우저에서 스크롤이 막힌다).
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <Animated.View style={[styles.row, { height: rowHeight }, active && styles.rowActive, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // 웹에서 꾹 누를 때 글자가 선택되지 않게.
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
  rowActive: { backgroundColor: c2.bg.canvas, borderRadius: radius2.lg, ...elevation2.card },
  sep: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c2.border.subtle },
});

import { useCallback, useRef } from 'react';
import { Animated, type NativeScrollEvent } from 'react-native';
import { duration } from '@/theme/motion';

// 임계값(px) — 손 떨림·관성 미세 진동으로 바가 깜박이지 않도록 이만큼 움직여야 방향 전환.
const THRESHOLD = 8;
// 목록 바닥 근접 판정 여유(px) — 이 안쪽이면 "끝에 닿음"으로 보고 CTA 강제 노출.
const BOTTOM_PAD = 24;

/**
 * 리스트를 아래로 내리면 하단 CTA 를 숨기고, 위로 올리면 다시 보여주는 hide-on-scroll 훅.
 *
 * `onScroll` 을 BottomSheetFlatList(혹은 일반 ScrollView) 에 연결하고,
 * 반환된 `visible`(0..1 Animated.Value) 을 StickyBottomBar 의 `visible` 로 넘긴다.
 * gorhom BottomSheetFlatList 는 onScroll 을 runOnJS 로 그대로 전달하므로 native/web 모두 동작.
 *
 * 맨 위(y<=0) 에선 항상 보이게 강제 — 빈 목록·짧은 목록에서 바가 숨은 채 시작하는 회로 차단.
 */
export function useHideOnScroll() {
  const visible = useRef(new Animated.Value(1)).current;
  const lastY = useRef(0);
  const shownRef = useRef(true);

  const setShown = useCallback(
    (next: boolean) => {
      if (shownRef.current === next) return;
      shownRef.current = next;
      Animated.timing(visible, {
        toValue: next ? 1 : 0,
        duration: duration.base,
        useNativeDriver: true,
      }).start();
    },
    [visible],
  );

  const onScroll = useCallback(
    (e: { nativeEvent: NativeScrollEvent }) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const y = contentOffset.y;
      if (y <= 0) {
        setShown(true);
        lastY.current = y;
        return;
      }
      // 바닥에 닿으면 더 내릴 게 없으므로 CTA 항상 노출 — 마지막 항목을 보려고 끝까지 내렸을 때
      // 바가 숨은 채 고착되던 회로 차단. (맨 위 y<=0 가드와 대칭)
      if (y + layoutMeasurement.height >= contentSize.height - BOTTOM_PAD) {
        setShown(true);
        lastY.current = y;
        return;
      }
      const dy = y - lastY.current;
      // 임계값 미만이면 lastY 를 갱신하지 않아 느린 스크롤도 누적되어 결국 방향 판정됨.
      if (Math.abs(dy) < THRESHOLD) return;
      setShown(dy < 0); // 위로(dy<0) → 보임 / 아래로(dy>0) → 숨김
      lastY.current = y;
    },
    [setShown],
  );

  return { onScroll, visible };
}

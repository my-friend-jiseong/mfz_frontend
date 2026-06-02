import { useState } from 'react';
import {
  Animated,
  StyleSheet,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme/spacing';

interface Props {
  children: React.ReactNode;
  safeArea?: boolean;
  pointerEvents?: ViewProps['pointerEvents'];
  // 0..1 Animated.Value (useHideOnScroll 제공). 1=보임, 0=아래로 슬라이드해 숨김.
  // 미지정 시 항상 보임 — 단일 CTA 화면(외근 상세/진행 중 등)은 그대로 동작.
  visible?: Animated.Value;
}

// 6 화면에 흩어진 absolute bottom CTA 패턴 통합.
// home indicator 가 있는 디바이스에서 spacing.xl 만으론 너무 가까이 붙던 회로
// 차단 — safe area bottom inset 위에 spacing.sm 만큼 띄움.
// active.tsx 의 '외근 종료' 처럼 BottomSheet 외부 mount 가 필요한 경우도 그대로 호환.
// 탭 루트 목록 화면은 visible 을 넘겨 hide-on-scroll 로 콘텐츠 가림을 줄인다.
export function StickyBottomBar({
  children,
  safeArea = true,
  pointerEvents = 'box-none',
  visible,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = safeArea
    ? Math.max(spacing.xl, insets.bottom + spacing.sm)
    : spacing.xl;

  // 숨김 시 바 높이 + 하단 오프셋만큼 내려 화면 밖으로 완전히 빠지게.
  // 초기 0 → 첫 onLayout 이후 실측 높이로 보정.
  const [height, setHeight] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setHeight(e.nativeEvent.layout.height);
  const hiddenOffset = height + bottom + spacing.xl;

  const animatedStyle = visible
    ? {
        opacity: visible,
        transform: [
          {
            translateY: visible.interpolate({
              inputRange: [0, 1],
              outputRange: [hiddenOffset, 0],
            }),
          },
        ],
      }
    : null;

  return (
    <Animated.View
      style={[styles.bar, { bottom }, animatedStyle]}
      pointerEvents={pointerEvents}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
  },
});

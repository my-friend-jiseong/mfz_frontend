import React, { forwardRef, useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type Insets,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { touchMin } from '@/theme/v2';
import { opacity } from '@/theme/motion';

export interface TouchableProps extends PressableProps {
  /** 누르는 동안 투명도. 기본 opacity.pressed(0.85). 0 이나 1 이면 효과 없음. */
  pressedOpacity?: number;
  /** hitSlop 자동 보충을 끈다(이미 48 이상인 행 등). */
  noAutoHitSlop?: boolean;
}

const slopFor = (w?: number, h?: number): Insets | undefined => {
  const dx = w != null && w < touchMin ? Math.ceil((touchMin - w) / 2) : 0;
  const dy = h != null && h < touchMin ? Math.ceil((touchMin - h) / 2) : 0;
  return dx || dy ? { top: dy, bottom: dy, left: dx, right: dx } : undefined;
};

/**
 * 2차 터치 규칙(size/touch-min 48): 보이는 크기가 48보다 작으면 모자란 만큼 hitSlop 을 붙인다.
 * - style 에 width/height 숫자가 있으면 바로 계산(첫 렌더부터 맞음).
 * - 없으면 onLayout 으로 잰 뒤 채운다.
 * - hitSlop 을 직접 주면 그 값을 쓴다.
 * 이웃 요소와 겹치지 않게 촘촘한 줄은 간격을 space[8] 이상 둔다(Figma Touch 규칙).
 */
export const Touchable = forwardRef<View, TouchableProps>(function Touchable(
  { style, hitSlop, onLayout, pressedOpacity = opacity.pressed, noAutoHitSlop, disabled, ...rest },
  ref,
) {
  const flat = typeof style === 'function' ? undefined : StyleSheet.flatten(style as StyleProp<ViewStyle>);
  const sw = typeof flat?.width === 'number' ? flat.width : undefined;
  const sh = typeof flat?.height === 'number' ? flat.height : undefined;
  const known = sw != null && sh != null;
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onLayout?.(e);
      if (known || noAutoHitSlop || hitSlop != null) return;
      const { width, height } = e.nativeEvent.layout;
      setMeasured((m) => (m && m.w === width && m.h === height ? m : { w: width, h: height }));
    },
    [onLayout, known, noAutoHitSlop, hitSlop],
  );

  const autoSlop = noAutoHitSlop
    ? undefined
    : known
      ? slopFor(sw, sh)
      : measured
        ? slopFor(measured.w, measured.h)
        : undefined;

  return (
    <Pressable
      ref={ref}
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop ?? autoSlop}
      onLayout={handleLayout}
      style={(state) => {
        const s = typeof style === 'function' ? style(state) : style;
        return [s, state.pressed && !disabled && pressedOpacity < 1 ? { opacity: pressedOpacity } : null];
      }}
    />
  );
});

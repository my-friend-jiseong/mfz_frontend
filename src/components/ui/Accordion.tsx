import React, { useEffect } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { duration, rEasing } from '@/theme/motion';

/**
 * 펼침 줄(3 외근 상세 방문 줄·5 현장 방문 기록·7 목적지 목록)의 공통 모션.
 * 줄 상자는 높이가 미끄러지고(layout), 펼친 내용은 흐려졌다 나타나며, 꺾쇠는 돌아간다.
 */
// 웹은 높이 변화를 미끄러뜨리지 않는다 — reanimated 웹의 LinearTransition 은 크기 변화를 scale 로 흉내 내 글자가 늘어났다
// 줄어든다(실측). 그래서 웹은 펼친 내용 페이드·꺾쇠만 두고, 접을 때 사라지는 페이드도 뺀다(아래 줄이 바로 올라와 겹치므로).
const IS_WEB = Platform.OS === 'web';
export const ACCORDION_LAYOUT = IS_WEB ? undefined : LinearTransition.duration(duration.base).easing(rEasing.standard);
const BODY_IN = FadeIn.duration(duration.base);
const BODY_OUT = IS_WEB ? undefined : FadeOut.duration(duration.fast);

/** 펼침 줄 바깥 상자 — 높이가 바뀌면 미끄러지고, 아래 줄들도 같이 밀려 내려간다(같은 layout 을 쓰는 형제끼리). */
export function AccordionRow({
  style,
  onLayout,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  onLayout?: React.ComponentProps<typeof Animated.View>['onLayout'];
  children: React.ReactNode;
}) {
  return (
    <Animated.View layout={ACCORDION_LAYOUT} style={style} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

export function AccordionBody({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <Animated.View entering={BODY_IN} exiting={BODY_OUT} style={style}>
      {children}
    </Animated.View>
  );
}

/** 펼치면 위를 보는 꺾쇠(chevron-down 을 180° 돌린다). */
export function AccordionChevron({
  expanded,
  size = 20,
  color,
  style,
}: {
  expanded: boolean;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const turn = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    turn.value = withTiming(expanded ? 1 : 0, { duration: duration.base, easing: rEasing.standard });
  }, [expanded, turn]);
  const rot = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <Animated.View style={[style, rot]}>
      <Icon name="chevron-down" size={size} color={color} />
    </Animated.View>
  );
}

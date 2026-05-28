import { useEffect } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/spacing';

interface Props {
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: Props) {
  const o = useSharedValue(0.5);

  useEffect(() => {
    o.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [o]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: rounded },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceMuted,
  },
});

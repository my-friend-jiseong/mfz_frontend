import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { c2, elevation2, space } from '@/theme/v2';

// Figma 8-2 파형: 정지 버튼 왼쪽 9개(오른쪽은 거울). [높이, 불투명도].
const BARS: [number, number][] = [
  [8, 0.58],
  [12, 0.65],
  [20, 0.78],
  [28, 0.92],
  [18, 0.75],
  [24, 0.85],
  [16, 0.72],
  [10, 0.62],
  [6, 0.55],
];
const STOP_SIZE = 64;
const STOP_MARK = 20;
const STOP_MARK_RADIUS = 5;
const DOT = 8;

interface Props {
  /** 입력 소리 크기 0~1. null 이면(웹) 파형이 제자리에서 천천히 움직인다. */
  level: number | null;
  onStop: () => void;
  onCancel: () => void;
}

/**
 * 8-2 체크인 · 음성 듣는 중 하단 패널(Figma 694:4324). 듣는 동안 [저장] 바 자리를 대신한다.
 * [취소]는 이번 말을 버리고, 가운데 정지는 들은 말을 메모에 넣고 끝낸다.
 */
export function VoiceListeningPanel({ level, onStop, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const amp = useSharedValue(0.6);
  useEffect(() => {
    if (level == null) {
      amp.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
      return () => cancelAnimation(amp);
    }
    amp.value = withTiming(0.35 + 0.65 * level, { duration: 100 });
    return undefined;
  }, [level, amp]);

  return (
    <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[16]) }]}>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <View style={styles.dot} />
        <Text v2="bodyS.bold" tone="brand">
          듣는 중
        </Text>
        <Text v2="bodyS.regular" tone="tertiary">
          {' · 말을 멈추면 자동으로 끝나요'}
        </Text>
      </View>
      <View style={styles.controls}>
        <Touchable onPress={onCancel} accessibilityRole="button" accessibilityLabel="음성 입력 취소" style={styles.cancel}>
          <Text v2="bodyM.semibold" tone="secondary">
            취소
          </Text>
        </Touchable>
        <Wave amp={amp} mirrored={false} />
        <Touchable onPress={onStop} accessibilityRole="button" accessibilityLabel="음성 입력 끝내기" style={styles.stop}>
          <View style={styles.stopMark} />
        </Touchable>
        <Wave amp={amp} mirrored />
      </View>
    </View>
  );
}

function Wave({ amp, mirrored }: { amp: SharedValue<number>; mirrored: boolean }) {
  const bars = mirrored ? [...BARS].reverse() : BARS;
  return (
    <View style={styles.wave} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {bars.map(([h, o], i) => (
        <Bar key={i} height={h} opacity={o} amp={amp} />
      ))}
    </View>
  );
}

function Bar({ height, opacity, amp }: { height: number; opacity: number; amp: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: amp.value }] }));
  return <Animated.View style={[styles.bar, { height, opacity }, style]} />;
}

const styles = StyleSheet.create({
  panel: {
    paddingTop: space[14],
    borderTopWidth: 1,
    borderTopColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
  },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: c2.danger, marginRight: space[8] },
  // 상태 줄(20) 아래 12 → 정지 버튼(Figma: 패널 위 46).
  controls: { marginTop: space[12], height: STOP_SIZE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[14] },
  cancel: { position: 'absolute', left: space[16], height: 48, paddingHorizontal: space[8], justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 2, backgroundColor: c2.bg.brand },
  stop: {
    width: STOP_SIZE,
    height: STOP_SIZE,
    borderRadius: STOP_SIZE / 2,
    backgroundColor: c2.bg.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation2.brandCta,
  },
  stopMark: { width: STOP_MARK, height: STOP_MARK, borderRadius: STOP_MARK_RADIUS, backgroundColor: c2.bg.canvas },
});

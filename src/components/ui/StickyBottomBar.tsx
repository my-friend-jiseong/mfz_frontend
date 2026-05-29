import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme/spacing';

interface Props {
  children: React.ReactNode;
  safeArea?: boolean;
  pointerEvents?: ViewProps['pointerEvents'];
}

// 6 화면에 흩어진 absolute bottom CTA 패턴 통합.
// home indicator 가 있는 디바이스에서 spacing.xl 만으론 너무 가까이 붙던 회로
// 차단 — safe area bottom inset 위에 spacing.sm 만큼 띄움.
// active.tsx 의 '외근 종료' 처럼 BottomSheet 외부 mount 가 필요한 경우도 그대로 호환.
export function StickyBottomBar({
  children,
  safeArea = true,
  pointerEvents = 'box-none',
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = safeArea
    ? Math.max(spacing.xl, insets.bottom + spacing.sm)
    : spacing.xl;
  return (
    <View style={[styles.bar, { bottom }]} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
  },
});

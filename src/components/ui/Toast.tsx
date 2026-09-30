import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { duration } from '@/theme/motion';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

interface ToastItem {
  id: number;
  message: string;
  icon: IonName;
}

// 명세 v2: 토스트는 2초 뒤 사라진다 (현장 등록·나중에 다시 작성·체크인 저장).
const VISIBLE_MS = 2000;
// 탭바(56) 위. 탭 루트에선 탭바 위로 24, 하단 액션 바(76)가 있는 푸시 화면에선 바 바로 위에 뜬다.
const TAB_BAR_CLEARANCE = 56 + spacing.xl;

let show: ((item: ToastItem) => void) | null = null;
let seq = 0;

// 호스트가 아직 마운트되지 않았으면 조용히 버린다 — 토스트는 부가 피드백이라
// 못 띄웠다고 흐름을 막지 않는다. 실패 안내는 토스트가 아니라 Alert 로 한다(명세 FE-RPT-12).
export function toast(message: string, opts?: { icon?: IonName }) {
  show?.({ id: ++seq, message, icon: opts?.icon ?? 'checkmark' });
}

// 앱 루트에 1회 마운트. 화면 전환(router.replace) 직후 호출해도 살아남도록 화면 밖에 둔다.
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ToastItem | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    show = (next) => {
      if (timer.current) clearTimeout(timer.current);
      setItem(next);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: duration.base, useNativeDriver: true }).start();
      AccessibilityInfo.announceForAccessibility?.(next.message);
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: duration.base, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setItem((cur) => (cur?.id === next.id ? null : cur));
          },
        );
      }, VISIBLE_MS);
    };
    return () => {
      show = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [anim]);

  if (!item) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}
    >
      <Animated.View
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [spacing.sm, 0] }) },
            ],
          },
        ]}
      >
        <Ionicons name={item.icon} size={24} color={colors.textInverse} />
        <Text variant="bodySm" color="textInverse" style={styles.label} numberOfLines={2}>
          {item.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    alignItems: 'center',
  },
  toast: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.text,
  },
  label: { flex: 1 },
});

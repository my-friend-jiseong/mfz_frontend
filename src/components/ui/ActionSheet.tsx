import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { OverlayModal } from './OverlayModal';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { animEasing, duration, opacity, useReducedMotionPref } from '@/theme/motion';


export interface ActionSheetOption {
  label: string;
  icon?: IconName;
  /** 파괴적 항목(삭제 등) — 빨강. */
  tone?: 'default' | 'danger';
  /** 현재 선택된 항목 표시(현장 선택 시트). */
  selected?: boolean;
  onPress: () => void;
}

interface Pending {
  title?: string;
  options: ActionSheetOption[];
}

let open: ((p: Pending) => void) | null = null;

/**
 * 하단 액션 시트 (명세 v2 §1.2 오버플로 `···`, §2.3 팝업).
 * 스크림을 탭하면 아무것도 하지 않고 닫힌다.
 *
 * gorhom BottomSheetModal 을 쓰지 않는 이유: 현재 버전(5.2.10)의 dynamic sizing 회귀(#2710)와
 * Fabric 에서 콘텐츠 height 가 적용되지 않던 전례(MapSheetLayout 주석). 항목 3~6개짜리 시트에
 * 스냅이 필요 없어 RN Modal 이 웹·네이티브 모두에서 가장 예측 가능하다.
 */
export function showActionSheet(options: ActionSheetOption[], title?: string) {
  open?.({ title, options });
}

// 닫힘 애니메이션이 끝난 다음 틱에 콜백을 부른다. iOS 도 OverlayModal 이 RN Modal 이 아닌 View 라
// dismiss 완료를 기다릴 필요가 없다(예전 350ms 는 RN Modal 시절 값).
const AFTER_CLOSE_MS = 0;

export function ActionSheetHost() {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [pending, setPending] = useState<Pending | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  // 여는 순번. 닫힘 애니메이션 도중 다시 열리면 이전 닫힘 콜백이 새 시트를 지우지 않게 한다.
  const openSeq = useRef(0);
  const closing = useRef(false);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    open = (p) => {
      openSeq.current += 1;
      closing.current = false;
      setPending(p);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: reduced ? duration.instant : duration.slow,
        easing: animEasing.enter,
        useNativeDriver: true,
      }).start();
    };
    return () => {
      open = null;
    };
  }, [anim, reduced]);

  const close = useCallback(
    (then?: () => void) => {
      // 항목 두 번 탭 → onPress 두 번(삭제·이동 중복)을 막는다.
      if (closing.current) return;
      closing.current = true;
      const seq = openSeq.current;
      Animated.timing(anim, {
        toValue: 0,
        duration: reduced ? duration.instant : duration.base,
        easing: animEasing.exit,
        useNativeDriver: true,
      }).start(() => {
        if (seq !== openSeq.current) return;
        closing.current = false;
        setPending(null);
        if (then) setTimeout(then, AFTER_CLOSE_MS);
      });
    },
    [anim, reduced],
  );

  if (!pending) return null;

  return (
    <OverlayModal visible onRequestClose={() => close()}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: anim }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close()}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.xl),
              maxHeight: windowH * 0.7,
              ...(reduced
                ? { opacity: anim }
                : { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [windowH * 0.4, 0] }) }] }),
            },
          ]}
        >
          {pending.title ? (
            <Text variant="caption" color="textMuted" style={styles.title}>
              {pending.title}
            </Text>
          ) : null}
          <ScrollView bounces={false}>
            {pending.options.map((o, i) => {
              const danger = o.tone === 'danger';
              const tint = danger ? colors.danger : colors.text;
              return (
                <Pressable
                  key={`${o.label}-${i}`}
                  onPress={() => close(o.onPress)}
                  accessibilityRole="button"
                  accessibilityState={o.selected ? { selected: true } : undefined}
                  style={({ pressed }) => [styles.row, pressed && { opacity: opacity.pressed }]}
                >
                  {o.icon ? <Icon name={o.icon} size={24} color={tint} /> : null}
                  <Text
                    variant="body"
                    weight={o.selected ? 'bold' : danger ? 'semibold' : undefined}
                    color={danger ? 'danger' : 'text'}
                    style={styles.label}
                    numberOfLines={1}
                  >
                    {o.label}
                  </Text>
                  {o.selected ? <Icon name="check" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  // 손잡이가 없으니 제목이 모서리에 붙지 않게 위 여백을 직접 준다.
  title: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  },
  label: { flex: 1 },
});

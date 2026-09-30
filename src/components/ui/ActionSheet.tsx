import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { duration, opacity } from '@/theme/motion';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

export interface ActionSheetOption {
  label: string;
  icon?: IonName;
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

// 모달이 완전히 내려간 뒤에 콜백을 부른다. iOS 는 모달 dismiss 가 끝나기 전에 다른 모달
// (이미지 피커·확인 대화상자)을 띄우면 조용히 무시한다.
const AFTER_CLOSE_MS = Platform.OS === 'ios' ? 350 : 0;

export function ActionSheetHost() {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const [pending, setPending] = useState<Pending | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  // 여는 순번. 닫힘 애니메이션 도중 다시 열리면 이전 닫힘 콜백이 새 시트를 지우지 않게 한다.
  const openSeq = useRef(0);
  const closing = useRef(false);

  useEffect(() => {
    open = (p) => {
      openSeq.current += 1;
      closing.current = false;
      setPending(p);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: duration.slow, useNativeDriver: true }).start();
    };
    return () => {
      open = null;
    };
  }, [anim]);

  const close = useCallback(
    (then?: () => void) => {
      // 항목 두 번 탭 → onPress 두 번(삭제·이동 중복)을 막는다.
      if (closing.current) return;
      closing.current = true;
      const seq = openSeq.current;
      Animated.timing(anim, { toValue: 0, duration: duration.base, useNativeDriver: true }).start(() => {
        if (seq !== openSeq.current) return;
        closing.current = false;
        setPending(null);
        if (then) setTimeout(then, AFTER_CLOSE_MS);
      });
    },
    [anim],
  );

  if (!pending) return null;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={() => close()}>
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
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [windowH * 0.4, 0] }) },
              ],
            },
          ]}
        >
          <View style={styles.grabber} />
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
                  {o.icon ? <Ionicons name={o.icon} size={24} color={tint} /> : null}
                  <Text
                    variant="body"
                    weight={o.selected ? 'bold' : undefined}
                    color={danger ? 'danger' : 'text'}
                    style={styles.label}
                    numberOfLines={1}
                  >
                    {o.label}
                  </Text>
                  {o.selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
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
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
  },
  title: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  },
  label: { flex: 1 },
});

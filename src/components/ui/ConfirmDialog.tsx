import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { duration, opacity } from '@/theme/motion';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 동작 — 확인 버튼이 빨강. */
  destructive?: boolean;
  /** 확인 버튼 없이 안내만 (차단 안내 등). */
  alertOnly?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let open: ((p: Pending) => void) | null = null;

/**
 * 확인 대화상자 (명세 v2 FE-UX-03 파괴적 액션 확인, FE-RPT-14 미작성 경고).
 * 웹·네이티브가 같은 모양이다 — Alert.alert 는 웹에서 window.confirm 로 떨어져 디자인과 다르다.
 * 호스트가 없으면 false(취소)로 끝난다: 확인 없이 파괴적 동작이 진행되는 쪽으로 새지 않게.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open) {
      resolve(false);
      return;
    }
    open({ ...options, resolve });
  });
}

/** 확인 버튼 하나짜리 안내. 닫히면 resolve. */
export function notice(title: string, message?: string): Promise<void> {
  return confirm({ title, message, alertOnly: true, cancelLabel: '확인' }).then(() => undefined);
}

const AFTER_CLOSE_MS = Platform.OS === 'ios' ? 350 : 0;

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const finishing = useRef(false);

  useEffect(() => {
    open = (p) => {
      // 앞선 대화상자가 떠 있으면 취소로 끝내고 교체한다 — await 하던 호출부가 영원히 멈추지 않게.
      finishing.current = false;
      setPending((prev) => {
        prev?.resolve(false);
        return p;
      });
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: duration.base, useNativeDriver: true }).start();
    };
    return () => {
      open = null;
    };
  }, [anim]);

  if (!pending) return null;

  const finish = (ok: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    const current = pending;
    const { resolve } = current;
    Animated.timing(anim, { toValue: 0, duration: duration.fast, useNativeDriver: true }).start(() => {
      finishing.current = false;
      // 닫히는 사이 새 대화상자가 열렸으면 그것을 지우지 않는다.
      setPending((cur) => (cur === current ? null : cur));
      setTimeout(() => resolve(ok), AFTER_CLOSE_MS);
    });
  };

  // 파괴적 확인은 스크림 탭으로 닫지 않는다 — 실수로 바깥을 눌러 '취소' 된 줄 모르는 일은
  // 없지만, 반대로 확인 창이 사라져 무슨 일이 있었는지 헷갈리는 일을 막는다.
  const scrimCloses = !pending.destructive;
  const confirmBg = pending.destructive ? colors.danger : colors.primary;

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => finish(false)}>
      <Animated.View style={[styles.root, { opacity: anim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={scrimCloses ? () => finish(false) : undefined}
          accessibilityRole={scrimCloses ? 'button' : undefined}
          accessibilityLabel={scrimCloses ? '닫기' : undefined}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            { transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] },
          ]}
        >
          <Text variant="h3">{pending.title}</Text>
          {pending.message ? (
            <Text variant="bodySm" color="textMuted">
              {pending.message}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Pressable
              onPress={() => finish(false)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btn,
                pending.alertOnly ? { backgroundColor: colors.primary } : styles.cancel,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Text variant="body" weight="semibold" color={pending.alertOnly ? 'onPrimary' : 'textMuted'}>
                {pending.cancelLabel ?? '취소'}
              </Text>
            </Pressable>
            {pending.alertOnly ? null : (
              <Pressable
                onPress={() => finish(true)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: confirmBg },
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Text variant="body" weight="bold" color="onPrimary">
                  {pending.confirmLabel ?? '확인'}
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg + spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: colors.surfaceMuted },
});

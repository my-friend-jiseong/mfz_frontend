import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { OverlayModal } from './OverlayModal';
import { Button2 } from './Button2';
import { Icon } from '@/components/icons';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { duration } from '@/theme/motion';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 동작 — 확인 버튼이 빨강. */
  destructive?: boolean;
  /** 확인 버튼 없이 안내만 (차단 안내 등). */
  alertOnly?: boolean;
  /**
   * 제목 아래 빨간 경고 상자(3-6 '이 외근으로 만든 보고서 …도 함께 지워져요.').
   * 함께 사라지는 것이 있을 때만 쓴다. message 는 그 아래 회색 글로 남는다.
   */
  warning?: string;
  /**
   * 확인 버튼을 누른 그 순간(같은 이벤트 안)에 부른다 — 웹에서 새 탭 열기·내려받기처럼 사용자 동작 안에서만
   * 허용되는 일을 할 때. resolve 는 닫힘 애니메이션 뒤라 브라우저가 막을 수 있다.
   */
  onConfirmPress?: () => void;
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

  // 2차 확인 창(3-5·3-6·5-11·8-13): 모서리 24, 제목 Title/M, 본문 Body M 회색, 버튼 52 두 개(취소=Secondary,
  // 확인=파괴적이면 Danger 아니면 Primary).
  return (
    <OverlayModal visible onRequestClose={() => finish(false)}>
      <Animated.View style={[styles.root, { opacity: anim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={scrimCloses ? () => finish(false) : undefined}
          accessibilityRole={scrimCloses ? 'button' : undefined}
          accessibilityLabel={scrimCloses ? '닫기' : undefined}
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            { transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] },
          ]}
        >
          <Text v2="title.m">{pending.title}</Text>
          {pending.warning ? (
            <View style={[styles.warning, { marginTop: space[12] }]}>
              <Icon name="warning" size={18} color={c2.text.danger} style={styles.warningIcon} />
              <Text v2="bodyM.semibold" tone="dangerStrong" style={styles.warningText}>
                {pending.warning}
              </Text>
            </View>
          ) : null}
          {pending.message ? (
            <Text v2="bodyM.regular" tone="secondary" style={{ marginTop: pending.warning ? space[12] : space[8] }}>
              {pending.message}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Button2
              size="M"
              variant={pending.alertOnly ? 'primary' : 'secondary'}
              onPress={() => finish(false)}
              style={styles.btn}
            >
              {pending.cancelLabel ?? '취소'}
            </Button2>
            {pending.alertOnly ? null : (
              <Button2
                size="M"
                variant={pending.destructive ? 'danger' : 'primary'}
                onPress={() => {
                  // 닫히는 중에 또 눌리면 두 번 열지 않는다.
                  if (finishing.current) return;
                  pending.onConfirmPress?.();
                  finish(true);
                }}
                style={styles.btn}
              >
                {pending.confirmLabel ?? '확인'}
              </Button2>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c2.bg.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: c2.bg.canvas,
    borderRadius: radius2['3xl'],
    paddingTop: space[24],
    paddingHorizontal: space[20],
    paddingBottom: space[20],
    ...elevation2.dialog,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[8],
    paddingVertical: space[12],
    paddingHorizontal: space[14],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.dangerSubtle,
  },
  warningIcon: { marginTop: 2 },
  warningText: { flex: 1 },
  // 제목→본문 8, 제목→경고 12, 경고→본문 12, 본문→버튼 22(Figma 3-6·5-11·8-13).
  buttons: { flexDirection: 'row', gap: space[8], marginTop: 22 },
  // Figma 확인 창 버튼은 M 인스턴스를 52 로 늘려 쓴다.
  btn: { flex: 1, height: 52 },
});

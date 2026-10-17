import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { animEasing, duration, useReducedMotionPref } from '@/theme/motion';
import { OverlayModal } from '@/components/ui/OverlayModal';
import { useRouter } from 'expo-router';
import { useSessionGuardStore } from '@/stores/sessionGuardStore';
import { Text } from '@/components/ui/Text';
import { Button2 } from '@/components/ui/Button2';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

const TITLE: Record<'superseded' | 'revoked', string> = {
  superseded: '다른 기기에서 로그인했어요',
  revoked: '보안을 위해 모든 기기에서 로그아웃됐어요',
};

export function SessionGuardModal() {
  const notice = useSessionGuardStore((s) => s.notice);
  const ack = useSessionGuardStore((s) => s.ack);
  const router = useRouter();
  // 페이드는 안에서 RN Animated 로 — 다른 오버레이 호스트와 같다. iOS 는 OverlayModal 이 RN Modal 이 아니라
  // animationType 이 먹지 않아 툭 나타났고, FullWindowOverlay 안에서 reanimated entering 은 믿기 어렵다.
  const fade = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotionPref();
  const shown = !!notice;
  useEffect(() => {
    if (!shown) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, {
      toValue: 1,
      duration: reduced ? duration.instant : duration.base,
      easing: animEasing.enter,
      useNativeDriver: true,
    }).start();
  }, [shown, fade, reduced]);

  // 안내 ack 시 로그인 화면으로 (refresh 분기에서 이미 store 비워짐)
  useEffect(() => {
    if (!notice) return;
  }, [notice]);

  if (!notice) return null;

  const handleConfirm = () => {
    ack();
    router.replace('/(auth)/login' as never);
  };

  return (
    <OverlayModal visible={!!notice} onRequestClose={handleConfirm}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <View style={styles.box}>
          <Text variant="h3" style={styles.title}>
            {TITLE[notice.type]}
          </Text>
          <Text variant="body" color="textMuted" style={styles.message}>
            {notice.message}
          </Text>
          <Button2 onPress={handleConfirm} size="L" fullWidth>
            다시 로그인
          </Button2>
        </View>
      </Animated.View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  box: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  title: { marginBottom: spacing.sm },
  message: { marginBottom: spacing.xl },
});

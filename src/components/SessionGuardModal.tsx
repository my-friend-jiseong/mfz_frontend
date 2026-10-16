import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { OverlayModal } from '@/components/ui/OverlayModal';
import { useRouter } from 'expo-router';
import { useSessionGuardStore } from '@/stores/sessionGuardStore';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
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
    <OverlayModal animationType="fade" visible={!!notice} onRequestClose={handleConfirm}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text variant="h3" style={styles.title}>
            {TITLE[notice.type]}
          </Text>
          <Text variant="body" color="textMuted" style={styles.message}>
            {notice.message}
          </Text>
          <Button onPress={handleConfirm} size="lg" fullWidth>
            다시 로그인
          </Button>
        </View>
      </View>
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

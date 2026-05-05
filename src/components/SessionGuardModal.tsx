import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSessionGuardStore } from '@/stores/sessionGuardStore';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

const TITLE: Record<'superseded' | 'revoked', string> = {
  superseded: '다른 기기에서 로그인되었습니다',
  revoked: '보안 경고 — 모든 세션이 종료되었습니다',
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
    <Modal transparent animationType="fade" visible={!!notice} onRequestClose={handleConfirm}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.title}>{TITLE[notice.type]}</Text>
          <Text style={styles.message}>{notice.message}</Text>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnText}>다시 로그인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});

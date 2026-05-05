import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

function fmtDate(iso?: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function initialOf(name: string | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0] ?? '?';
}

export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const offlinePending = useOfflineQueueStore((s) => s.queue.length);

  const [loggingOut, setLoggingOut] = useState(false);

  const performLogout = async () => {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    router.replace('/(auth)/login' as never);
  };

  const handleLogout = () => {
    const message =
      offlinePending > 0
        ? `동기화 대기 중인 작업이 ${offlinePending}건 있습니다.\n로그아웃 시 폐기됩니다. 계속할까요?`
        : '정말 로그아웃하시겠습니까?';

    if (Platform.OS === 'web') {
      if (confirm(message)) void performLogout();
    } else {
      Alert.alert('로그아웃', message, [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: () => void performLogout() },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarBox}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialOf(user?.name)}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? '-'}</Text>
          <Text style={styles.email}>{user?.email ?? '-'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>가입일</Text>
            <Text style={styles.infoValue}>{fmtDate(user?.createdAt)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>이메일</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {user?.email ?? '-'}
            </Text>
          </View>
        </View>

        {offlinePending > 0 ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>동기화 대기 중</Text>
            <Text style={styles.warnBody}>
              네트워크 끊김 동안 누적된 작업이 {offlinePending}건 있습니다. 네트워크 복구 후 자동 동기화됩니다.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          style={({ pressed }) => [
            styles.logoutBtn,
            (pressed || loggingOut) && styles.pressed,
          ]}
        >
          <Text style={styles.logoutText}>
            {loggingOut ? '로그아웃 중...' : '로그아웃'}
          </Text>
        </Pressable>

        <Text style={styles.versionHint}>일가요 v0.1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  avatarBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  warnBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f0ad4e',
    backgroundColor: '#fff7e6',
  },
  warnTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  warnBody: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  logoutBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  logoutText: { color: colors.danger, fontSize: fontSize.base, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  versionHint: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});

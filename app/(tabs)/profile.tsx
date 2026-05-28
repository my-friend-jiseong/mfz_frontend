import { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate } from '@/utils/datetime';

const APP_VERSION = '0.1.0';
const TERMS_URL = 'https://ilgayo.kr/terms';
const PRIVACY_URL = 'https://ilgayo.kr/privacy';

function initialOf(name: string | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0] ?? '?';
}

type IonName = React.ComponentProps<typeof Ionicons>['name'];

function MenuRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IonName;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const interactive = !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && interactive && { opacity: opacity.pressed },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.menuLabel}>{label}</Text>
      {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      {interactive ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
      ) : null}
    </Pressable>
  );
}

export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [loggingOut, setLoggingOut] = useState(false);

  const performLogout = async () => {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    router.replace('/(auth)/login' as never);
  };

  const handleLogout = () => {
    const message = '정말 로그아웃하시겠습니까?';

    if (Platform.OS === 'web') {
      if (confirm(message)) void performLogout();
    } else {
      Alert.alert('로그아웃', message, [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: () => void performLogout() },
      ]);
    }
  };

  const openExternal = (url: string, fallbackTitle: string) => {
    // web 에선 Linking.openURL 이 SPA 자체를 떠나 미저장 상태를 잃음.
    // 새 탭으로 열어 사용자의 현재 세션을 보존.
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.canOpenURL(url)
      .then((ok) => {
        if (ok) return Linking.openURL(url);
        throw new Error('not_supported');
      })
      .catch(() => {
        Alert.alert(fallbackTitle, `${url}\n\n웹브라우저에서 위 주소로 접속해주세요.`);
      });
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

        <Text style={styles.sectionTitle}>계정</Text>
        <Card padding="none" style={styles.sectionCard}>
          <MenuRow icon="mail-outline" label="이메일" value={user?.email ?? '-'} />
          <View style={styles.divider} />
          <MenuRow
            icon="calendar-outline"
            label="가입일"
            value={fmtDate(user?.createdAt)}
          />
        </Card>

        <Text style={styles.sectionTitle}>정책·정보</Text>
        <Card padding="none" style={styles.sectionCard}>
          <MenuRow
            icon="document-text-outline"
            label="이용약관"
            onPress={() => openExternal(TERMS_URL, '이용약관')}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="shield-checkmark-outline"
            label="개인정보 처리방침"
            onPress={() => openExternal(PRIVACY_URL, '개인정보 처리방침')}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="information-circle-outline"
            label="앱 버전"
            value={`v${APP_VERSION}`}
          />
        </Card>

        <Button
          onPress={handleLogout}
          loading={loggingOut}
          variant="destructive"
          fullWidth
          leftIcon="log-out-outline"
          style={styles.logout}
        >
          로그아웃
        </Button>
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
    color: colors.onPrimary,
    fontSize: 36,
    fontWeight: fontWeight.heavy,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: lineHeight.xl,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: { gap: 0 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  menuLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  menuValue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: spacing.lg + 18 + spacing.md, // icon + gap 만큼 왼쪽 들여쓰기
  },
  logout: { marginTop: spacing.xl },
});

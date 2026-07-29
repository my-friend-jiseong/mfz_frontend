import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { SafeScreen } from '@/components/SafeScreen';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate } from '@/utils/datetime';
import {
  LOCATION_TERMS_AVAILABLE,
  LOCATION_TERMS_URL,
  PRIVACY_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
  supportMailto,
} from '@/utils/contact';

const APP_VERSION = '0.1.0';

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
  tone = 'default',
}: {
  icon: IonName;
  label: string;
  value?: string;
  onPress?: () => void;
  // 'danger' — 되돌릴 수 없는 동작(탈퇴)을 목록 안에서 시각적으로 분리한다.
  tone?: 'default' | 'danger';
}) {
  const interactive = !!onPress;
  const danger = tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && interactive && { opacity: opacity.pressed },
      ]}
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textMuted} />
      <Text
        variant="bodySm"
        weight="semibold"
        color={danger ? 'danger' : undefined}
        style={styles.menuLabel}
      >
        {label}
      </Text>
      {value ? (
        <Text variant="bodySm" color="textMuted">
          {value}
        </Text>
      ) : null}
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

  // 탭 진입 시 스크롤 위로 reset — 다른 탭(MapSheetLayout 사용)들과 일관된 진입 UX.
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      const handle = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(handle);
    }, []),
  );

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

  // 문의하기 — 개인정보 열람·수정·삭제, 회원 탈퇴, 일반 문의 창구.
  // mailto 는 canOpenURL 로 미리 재지 않는다: Android 11+ 는 매니페스트 <queries> 없이는
  // 메일 앱이 있어도 false 를 돌려줘, 멀쩡한 기기에서 폴백 안내만 뜨게 된다.
  const handleContact = () => {
    const url = supportMailto('[일가요] 문의');
    if (Platform.OS === 'web') {
      // 새 탭으로 열면 메일 앱이 뜬 뒤 빈 탭이 남는다 — 현재 문서에서 핸들러를 부른다.
      window.location.href = url;
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert('문의하기', `메일 앱을 열 수 없습니다.\n\n${SUPPORT_EMAIL} 로 보내주세요.`);
    });
  };

  return (
    <SafeScreen>
    <View style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <View style={styles.avatarBox}>
          <View style={styles.avatar}>
            <Text weight="heavy" color="onPrimary" style={styles.avatarText}>
              {initialOf(user?.name)}
            </Text>
          </View>
          <Text variant="h2" weight="heavy" align="center" style={styles.name}>
            {user?.name ?? '-'}
          </Text>
          <Text variant="bodySm" color="textMuted" align="center">
            {user?.email ?? '-'}
          </Text>
        </View>

        <Text
          variant="caption"
          weight="bold"
          color="textMuted"
          style={styles.sectionTitle}
        >
          계정
        </Text>
        <Card padding="none" style={styles.sectionCard}>
          <MenuRow icon="mail-outline" label="이메일" value={user?.email ?? '-'} />
          <View style={styles.divider} />
          <MenuRow
            icon="calendar-outline"
            label="가입일"
            value={fmtDate(user?.createdAt)}
          />
          <View style={styles.divider} />
          {/* backend-backlog §15 — 이름·비밀번호 변경. 이전엔 '관리자 문의' 안내뿐이었다. */}
          <MenuRow
            icon="create-outline"
            label="내 정보 수정"
            onPress={() => router.push('/(tabs)/profile/edit' as never)}
          />
          <View style={styles.divider} />
          {/* 스토어 심사 요건 — Play 는 계정을 만드는 앱에 계정·데이터 삭제 경로를 요구한다.
              서버 DELETE /api/me 는 backend-backlog §30 대기. */}
          <MenuRow
            icon="person-remove-outline"
            label="회원 탈퇴"
            tone="danger"
            onPress={() => router.push('/(tabs)/profile/delete-account' as never)}
          />
        </Card>

        <Text
          variant="caption"
          weight="bold"
          color="textMuted"
          style={styles.sectionTitle}
        >
          정책·정보
        </Text>
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
          {/* 위치정보 이용약관 — 페이지가 실제로 뜰 때만 노출한다(utils/contact.ts 참조).
              2026-07-29 기준 404 이고, 죽은 정책 링크는 심사에서 없느니만 못하다. */}
          {LOCATION_TERMS_AVAILABLE ? (
            <>
              <View style={styles.divider} />
              <MenuRow
                icon="location-outline"
                label="위치정보 이용약관"
                onPress={() => openExternal(LOCATION_TERMS_URL, '위치정보 이용약관')}
              />
            </>
          ) : null}
          <View style={styles.divider} />
          <MenuRow
            icon="chatbubble-ellipses-outline"
            label="문의하기"
            value={SUPPORT_EMAIL}
            onPress={handleContact}
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
    </SafeScreen>
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
  // 매직 넘버 36 — typography scale 밖. avatar 1 곳 전용.
  avatarText: { fontSize: 36 },
  name: { marginTop: spacing.sm },
  sectionTitle: {
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
  menuLabel: { flex: 1 },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginLeft: spacing.lg + 18 + spacing.md, // icon + gap 만큼 왼쪽 들여쓰기
  },
  logout: { marginTop: spacing.xl },
});

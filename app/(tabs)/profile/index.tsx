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
import { GroupLabel } from '@/components/ui/GroupLabel';
import { SafeScreen } from '@/components/SafeScreen';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
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

// 이 화면의 focal 은 숫자가 아니라 **정체성**이다 — "지금 어느 계정으로 들어와 있나".
// 이전엔 아바타 이니셜(36px)이 화면에서 가장 큰 글자였는데, 그 글자는 바로 아래 이름의
// 첫 글자라 정보량이 0 이다. 가장 큰 것이 아무것도 말하지 않으면 위계가 없는 것과 같다.
// 아바타는 이름을 받치는 자리로 내리고(56), 이니셜은 타입 스케일 안(h2)으로 들여놨다.
const AVATAR_SIZE = 56;

// MenuRow 아이콘 크기 — divider 들여쓰기 계산이 이 값에 걸려 있어 상수로 묶는다.
// (이전엔 Ionicons size={18} 과 divider 의 `+ 18` 이 따로 적혀 있어 한쪽만 바꾸면 어긋났다.)
const MENU_ICON = 18;

function initialOf(name: string | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0] ?? '?';
}

type IonName = React.ComponentProps<typeof Ionicons>['name'];

// 파괴적 동작을 위한 tone='danger' 는 없다 — 되돌릴 수 없는 것은 목록 안에서 색만 바꾸는
// 대신 하단 '위험 구역' 으로 내보낸다(아래 dangerZone 주석).
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
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && interactive && { opacity: opacity.pressed },
      ]}
    >
      <Ionicons name={icon} size={MENU_ICON} color={colors.textMuted} />
      <Text variant="bodySm" weight="semibold" style={styles.menuLabel}>
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
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text variant="h2" color="onPrimary">
              {initialOf(user?.name)}
            </Text>
          </View>
          <Text variant="h1" align="center" style={styles.name}>
            {user?.name ?? '-'}
          </Text>
          {/* 이메일은 여기 한 곳에만 둔다 — 이전엔 이 줄과 '계정' 카드 첫 행이 같은 값을
              100px 간격으로 두 번 보여줬다. */}
          <Text variant="bodySm" color="textMuted" align="center">
            {user?.email ?? '-'}
          </Text>
        </View>

        {/* 정체성 블록 ↔ 메뉴는 영역 경계라 xxl. 아래 섹션들끼리는 GroupLabel 기본값(xl). */}
        <GroupLabel style={styles.firstGroup}>계정</GroupLabel>
        <Card padding="none" style={styles.sectionCard}>
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
        </Card>

        <GroupLabel>정책·정보</GroupLabel>
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

        {/* 로그아웃은 파괴적이지 않다 — 다시 로그인하면 끝이다. 이전엔 solid destructive(빨강
            채움)라 화면에서 가장 강한 신호를 되돌릴 수 있는 동작이 쓰고 있었고, 정작 되돌릴 수
            없는 탈퇴는 목록 안 한 줄이었다. Button.tsx 의 '빨강 = 파괴' 규칙과도 어긋난다. */}
        <Button
          onPress={handleLogout}
          loading={loggingOut}
          variant="secondary"
          fullWidth
          leftIcon="log-out-outline"
          style={styles.logout}
        >
          로그아웃
        </Button>

        {/* 위험 구역 — 파괴적 동작은 일상 동선과 분리(구분선) + 낮은 비중(dangerGhost).
            fields/trips edit 화면과 동일한 패턴. 스토어 심사 요건(Play)이 요구하는
            계정·데이터 삭제 경로이므로 화면 밖으로 숨기지는 않는다.
            서버 DELETE /api/me 는 backend-backlog §30 대기. */}
        <View style={styles.dangerZone}>
          <Button
            onPress={() => router.push('/(tabs)/profile/delete-account' as never)}
            variant="dangerGhost"
            size="sm"
            fullWidth
            leftIcon="person-remove-outline"
          >
            회원 탈퇴
          </Button>
        </View>
      </ScrollView>
    </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  // paddingVertical 을 뺐다 — scroll 의 padding xl 이 이미 위 여백이고, 아래는 '계정'
  // 라벨의 marginTop 이 담당한다. 겹치면 48px 짜리 빈 띠가 생긴다.
  identity: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: spacing.sm },
  firstGroup: { marginTop: spacing.xxl },
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
    // 라벨 왼쪽 끝에 맞춘다 — 카드 패딩 + 아이콘 + gap.
    marginLeft: spacing.lg + MENU_ICON + spacing.md,
  },
  logout: { marginTop: spacing.xl },
  dangerZone: {
    marginTop: spacing.xxl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
});

import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useCheckinQueueStore } from '@/stores/checkinQueueStore';
import { confirm } from '@/components/ui/ConfirmDialog';
import { useMiniBarInset } from '@/stores/bottomChromeStore';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon, type IconName } from '@/components/icons';
import { SafeScreen } from '@/components/SafeScreen';
import { c2, radius2, space } from '@/theme/v2';
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
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed)[0] ?? '?';
}

/** 2026. 3. 4. — Figma 10 가입일 표기. */
function fmtJoined(iso: string | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

// 목록 한 줄(Figma 10 'Row'). 누를 수 있으면 오른쪽 >, 값이 있으면 > 앞에 회색 값.
function MenuRow({
  icon,
  label,
  value,
  onPress,
  first,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  first?: boolean;
}) {
  const content = (
    <>
      <Icon name={icon} size={20} color={c2.text.tertiary} />
      <Text v2="bodyM.semibold" tone="primary" style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text v2="bodyS.regular" tone="tertiary" numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Icon name="chevron-right" size={18} color={c2.text.tertiary} /> : null}
    </>
  );
  const style = [styles.row, !first && styles.rowDivider];
  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={value ? `${label}: ${value}` : label}>
        {content}
      </View>
    );
  }
  return (
    <Touchable
      onPress={onPress}
      noAutoHitSlop
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={style}
    >
      {content}
    </Touchable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text v2="caption.bold" tone="secondary" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

// 10 내 정보 (Figma 584:2537). 프로필 줄 전체가 10-1 내 정보 수정으로 간다 — 따로 '내 정보 수정' 행은 두지 않는다
// (결정 v85: 로그아웃이 탭 바에 가리지 않게). 분류 관리는 현장 화면의 분류 시트로 옮겼다(인수인계 5-6~5-9).
export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  // 외근 중 미니 바(7-4)가 마지막 줄을 가리지 않게.
  const miniBarInset = useMiniBarInset();
  const [loggingOut, setLoggingOut] = useState(false);

  // 탭 진입 시 스크롤 위로 reset — 다른 탭들과 일관된 진입 UX.
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      const handle = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(handle);
    }, []),
  );

  // 10 [로그아웃] → 11 로그인 바로(결정 v86 연결). 되돌릴 수 있는 동작이라 확인 창을 두지 않는다.
  // 다만 보내지 못한 체크인이 있으면 로그아웃이 그 기록을 지우므로 먼저 묻는다.
  const handleLogout = async () => {
    if (loggingOut) return;
    const uid = useAuthStore.getState().user?.id;
    const unsent = uid ? useCheckinQueueStore.getState().items.filter((x) => x.userId === uid).length : 0;
    if (unsent > 0) {
      const ok = await confirm({
        title: '로그아웃할까요?',
        message: `보내지 못한 체크인이 ${unsent}건 있어요. 로그아웃하면 사라져요.`,
        confirmLabel: '로그아웃',
        destructive: true,
      });
      if (!ok) return;
    }
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      // logout 이 던져도(로컬 정리 실패 등) 로그인 화면으로는 보낸다.
      router.replace('/(auth)/login' as never);
    }
  };

  const openExternal = (url: string, fallbackTitle: string) => {
    // web 에선 Linking.openURL 이 SPA 자체를 떠나 미저장 상태를 잃는다. 새 탭으로 연다.
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
        Alert.alert(fallbackTitle, `${url}\n\n웹 브라우저에서 위 주소로 열어 주세요.`);
      });
  };

  // 문의하기는 메일 앱으로(2차: 앱 안 문의 화면 없앰).
  const handleContact = () => {
    const url = supportMailto(`[일가요] 문의 (${user?.email ?? ''})`);
    void Linking.openURL(url).catch(() => {
      Alert.alert('메일 앱을 열 수 없어요', `${SUPPORT_EMAIL} 로 보내 주세요.`);
    });
  };

  return (
    <SafeScreen background={c2.bg.canvas}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: space[24] + miniBarInset }]}
      >
        <Text v2="display" tone="primary" accessibilityRole="header" style={styles.title}>
          내 정보
        </Text>

        <Touchable
          onPress={() => router.push('/(tabs)/profile/edit' as never)}
          noAutoHitSlop
          accessibilityRole="button"
          accessibilityLabel={`내 정보 수정: ${user?.name ?? ''}, ${user?.email ?? ''}`}
          style={styles.profile}
        >
          <View style={styles.avatar}>
            <Text v2="avatar" tone="inverse">
              {initialOf(user?.name)}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text v2="title.m" tone="primary" numberOfLines={1}>
              {user?.name ?? '-'}
            </Text>
            <Text v2="bodyS.regular" tone="tertiary" numberOfLines={1} style={styles.email}>
              {user?.email ?? '-'}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={c2.text.tertiary} />
        </Touchable>

        <Section title="계정">
          <MenuRow first icon="calendar" label="가입일" value={fmtJoined(user?.createdAt)} />
          <MenuRow
            icon="user-x"
            label="회원 탈퇴"
            onPress={() => router.push('/(tabs)/profile/delete-account' as never)}
          />
        </Section>

        <Section title="정책·정보">
          <MenuRow first icon="document" label="이용약관" onPress={() => openExternal(TERMS_URL, '이용약관')} />
          <MenuRow
            icon="shield-check"
            label="개인정보 처리방침"
            onPress={() => openExternal(PRIVACY_URL, '개인정보 처리방침')}
          />
          {/* 위치정보 이용약관 — 페이지가 실제로 뜰 때만 노출한다(utils/contact.ts 참조). */}
          {LOCATION_TERMS_AVAILABLE ? (
            <MenuRow
              icon="map"
              label="위치정보 이용약관"
              onPress={() => openExternal(LOCATION_TERMS_URL, '위치정보 이용약관')}
            />
          ) : null}
          <MenuRow icon="info" label="앱 버전" value={`v${APP_VERSION}`} />
          <MenuRow icon="help-circle" label="문의하기" value="메일" onPress={handleContact} />
        </Section>

        <Button2
          variant="danger"
          size="M"
          icon="logout"
          loading={loggingOut}
          onPress={() => void handleLogout()}
          fullWidth
          style={styles.logout}
        >
          로그아웃
        </Button2>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: c2.bg.canvas },
  scroll: { paddingHorizontal: space[20] },
  // Figma 10: 상태 표시줄 아래 12 에 큰 제목, 제목 아래 8 + 12 띄우고 프로필 줄.
  title: { marginTop: space[12], marginBottom: space[8] },
  profile: { marginTop: space[12], height: 60, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1 },
  email: { marginTop: space[2] },
  section: { marginTop: space[20] + space[2] },
  sectionTitle: { marginLeft: space[4], marginBottom: space[8] },
  list: {
    borderWidth: 1,
    borderColor: c2.border.default,
    borderRadius: radius2.xl,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[16],
    backgroundColor: c2.bg.canvas,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  rowLabel: { flexGrow: 1, flexShrink: 0 },
  rowValue: { flexShrink: 1 },
  logout: { marginTop: space[20] + space[2], height: 52 },
});

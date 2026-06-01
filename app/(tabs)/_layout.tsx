import { useEffect, useState } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useFieldStore } from '@/stores/fieldStore';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

function TabItem({
  label,
  icon,
  color,
  size,
}: {
  label: string;
  icon: IonName;
  color: string;
  size: number;
}) {
  return (
    <View style={styles.item}>
      <Ionicons name={icon} size={size} color={color} />
      <Text variant="caption" weight="semibold" style={[styles.label, { color }]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  // deep-link 새로고침 시 hydrate 가 실패한 케이스 (refresh 토큰 만료·무효 등) 에서
  // (tabs) 가 토큰 없이 hydrateTrips/Fields 를 호출해 401 을 흘리는 회로 차단.
  // index.tsx 의 redirect 는 / 진입에서만 동작하므로 여기 별도 게이트가 필요.
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateTrips = useTripStore((s) => s.hydrate);
  const hydrateFields = useFieldStore((s) => s.hydrate);

  // 인증 후 진입 시 외근/현장 초기 페치 — trips 탭이 첫 화면이라도 지도(MapDashboard)에
  // 마커가 즉시 그려지도록 fields 도 함께 hydrate. fields 탭의 filter 기반 refresh 는 그대로.
  useEffect(() => {
    if (!isAuthenticated) return;
    void hydrateTrips();
    void hydrateFields();
  }, [isAuthenticated, hydrateTrips, hydrateFields]);

  // 로그인 직후 (tabs) 진입 시 isAuthenticated 가 한 프레임 false 로 튀며 login 으로 바운스됐다
  // 곧장 복귀하던 회로(refresh 회전/마운트 타이밍 레이스) 차단. 전환 직후 짧은 grace 동안은
  // redirect 를 보류하고, 그 사이 인증이 회복되면 그대로 진행. 진짜 미인증(deep-link)이면
  // grace 후 redirect — 사용자 체감엔 영향 없는 150ms.
  const [graceExpired, setGraceExpired] = useState(false);
  useEffect(() => {
    if (isAuthenticated) {
      setGraceExpired(false);
      return;
    }
    const id = setTimeout(() => setGraceExpired(true), 150);
    return () => clearTimeout(id);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return graceExpired ? <Redirect href="/(auth)/login" /> : null;
  }

  return (
    <Tabs
      initialRouteName="trips"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          // 84 = home indicator + tab convention(RN 표준값). 거기에 하단 inset 을 더해
          // 제스처 네비게이션 바 위로 탭 아이콘이 올라오도록 — 네이티브에서 탭이 잘리던 회로 차단.
          height: 84 + insets.bottom,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm + insets.bottom,
        },
        tabBarShowLabel: false,
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="trips"
        options={{
          title: '외근',
          tabBarIcon: ({ color, size }) => (
            <TabItem label="외근" icon="briefcase" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="fields"
        options={{
          title: '현장',
          tabBarIcon: ({ color, size }) => (
            <TabItem label="현장" icon="location" color={color} size={size} />
          ),
        }}
        listeners={() => ({
          tabPress: () => {
            // 탭 클릭 시 항상 현장 목록(index)로 리셋 — 이전 [id] 상세에 머물러 있던 stack 잔재를 클리어
            router.replace('/(tabs)/fields' as never);
          },
        })}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: '보고서',
          tabBarIcon: ({ color, size }) => (
            <TabItem
              label="보고서"
              icon="document-text"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color, size }) => (
            <TabItem label="내 정보" icon="person-circle" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  label: {
    marginTop: 4,
    textAlign: 'center',
  },
});

import { useEffect } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
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

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
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
          // height 84 는 home indicator + tab convention — RN tab 표준값으로 유지.
          height: 84,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
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

import { useEffect } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';

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
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  // deep-link 새로고침 시 hydrate 가 실패한 케이스 (refresh 토큰 만료·무효 등) 에서
  // (tabs) 가 토큰 없이 hydrateTrips/Fields 를 호출해 401 을 흘리는 회로 차단.
  // index.tsx 의 redirect 는 / 진입에서만 동작하므로 여기 별도 게이트가 필요.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateTrips = useTripStore((s) => s.hydrate);

  // 인증 후 진입 시 외근만 초기 페치. 현장 전체 페치는 fields 탭 진입 시점으로 한정 —
  // 외근 탭이 첫 화면일 때 사용자가 외근을 선택하지 않은 상태에서 굳이 모든 현장을
  // 끌어오지 않도록(요구사항 정리 #4). 외근이 진행 중일 때 destinations.fieldId 의
  // 현장 좌표는 active 화면 진입 시점에 ensure-load 됨.
  useEffect(() => {
    if (!isAuthenticated) return;
    void hydrateTrips();
  }, [isAuthenticated, hydrateTrips]);

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
          height: 84,
          paddingTop: 10,
          paddingBottom: 10,
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
        listeners={() => ({
          tabPress: () => {
            // 탭 클릭 시 항상 외근 목록(index) 으로 리셋 — active/[id] 등 stack 잔재 클리어
            router.replace('/(tabs)/trips' as never);
          },
        })}
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
        listeners={() => ({
          tabPress: () => {
            router.replace('/(tabs)/reports' as never);
          },
        })}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color, size }) => (
            <TabItem label="내 정보" icon="person-circle" color={color} size={size} />
          ),
        }}
        listeners={() => ({
          tabPress: () => {
            router.replace('/(tabs)/profile' as never);
          },
        })}
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
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
    textAlign: 'center',
  },
});

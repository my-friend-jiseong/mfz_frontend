import { useEffect, useState } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { fontSize } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useFieldStore } from '@/stores/fieldStore';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

// 라벨은 React Navigation 이 직접 그린다 — 직접 만든 아이콘+라벨 묶음을 tabBarIcon 으로
// 넘기면 안 된다. tabBarShowLabel:false 일 때 RN 은 '아이콘 슬롯'을 아이콘 크기(실측 28px)로만
// 잡는데, 그 안에 라벨까지 넣으면 콘텐츠 43px 이 15px 넘쳐 아이콘이 바 위로 삐져나오고
// 위 여백이 사라진다(웹 실측: 아이콘 top 이 바 top 보다 위). 슬롯 규격에 맞춰 아이콘만 넘기고
// 라벨·간격은 tabBarLabelStyle 로 다룬다.
const tabIcon =
  (name: IonName) =>
  ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );

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
          // 콘텐츠 높이 56 = Material Design bottom navigation 표준값. 거기에 OS 가 보고하는
          // 실제 네비게이션 바 높이(insets.bottom)만 더해 바를 띄운다 — 임의 수치 없이 표준 + 실측.
          height: 56 + insets.bottom,
          // paddingTop 을 두지 않는다 — React Navigation 이 탭 아이템에 자체 상하 padding(5) 을
          // 이미 넣는다. 여기서 더하면 이중으로 공간을 먹어 아이콘 위 여백이 사라진다(실측).
          paddingBottom: insets.bottom,
        },
        tabBarLabelPosition: 'below-icon',
        // 앱 서체(Pretendard)·caption 크기로 맞춤 — Text 컴포넌트를 못 쓰는 자리라 토큰 직접 사용.
        tabBarLabelStyle: {
          fontFamily: fontFamily.semibold,
          fontSize: fontSize.xs,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="trips"
        options={{
          title: '외근',
          tabBarIcon: tabIcon('briefcase'),
        }}
      />
      <Tabs.Screen
        name="fields"
        options={{
          title: '현장',
          tabBarIcon: tabIcon('location'),
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
          tabBarIcon: tabIcon('document-text'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: tabIcon('person-circle'),
        }}
      />
    </Tabs>
  );
}

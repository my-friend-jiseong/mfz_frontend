import { useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { Redirect, Tabs, useSegments } from 'expo-router';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar, tabBarHeight } from '@/components/shell/AppTabBar';
import { RealSafeAreaInsetsContext } from '@/components/shell/realInsets';
import { needsStackReset, resetTabStack } from '@/components/shell/tabNav';
import { TripMiniBar, MINI_BAR_HEIGHT } from '@/components/shell/TripMiniBar';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useBottomChromeStore } from '@/stores/bottomChromeStore';

// 미니 바(7-4)를 띄우는 탭. 외근 탭은 첫 화면이 곧 외근 진행(7)이라 띄우지 않는다.
// 그 탭의 첫 화면(9 보고서 목록·10 내 정보)에서만 — 푸시된 입력 화면(현장 보고·보고서 작성 등)에서는
// 하단 버튼 바와 겹치므로 띄우지 않는다.
const MINI_BAR_TABS = new Set(['reports', 'profile']);

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export default function TabsLayout() {
  // deep-link 새로고침 시 hydrate 가 실패한 케이스 (refresh 토큰 만료·무효 등) 에서
  // (tabs) 가 토큰 없이 hydrateTrips/Fields 를 호출해 401 을 흘리는 회로 차단.
  // index.tsx 의 redirect 는 / 진입에서만 동작하므로 여기 별도 게이트가 필요.
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateTrips = useTripStore((s) => s.hydrate);
  const hydrateFields = useFieldStore((s) => s.hydrate);
  const tripActive = useTripStore((s) => s.activeTripId !== null);

  // 인증 후 진입 시 외근/현장 초기 페치 — trips 탭이 첫 화면이라도 지도(MapDashboard)에
  // 마커가 즉시 그려지도록 fields 도 함께 hydrate.
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

  // 탭 바는 모든 탭 화면(푸시 화면 포함)에서 보인다(인수인계 §2 공통, HIG). 탭 바를 가려야 하는 화면은
  // 루트 (modals) 스택으로 올린다. 탭 바가 아래 safe area 를 먹으므로 탭 화면들에는 bottom inset 0 을 내려
  // 하단 버튼 바·시트가 탭 바 위에 홈 인디케이터 여백을 또 얹지 않게 한다.
  const barH = tabBarHeight(insets.bottom);
  const screenInsets = useMemo(() => ({ ...insets, bottom: 0 }), [insets]);
  const keyboardVisible = useKeyboardVisible();
  // segments: 탭 첫 화면은 ['(tabs)', 'reports'], 푸시 화면은 그보다 길다.
  const showMiniBar =
    tripActive && !keyboardVisible && segments.length === 2 && MINI_BAR_TABS.has(segments[1] ?? '');

  const setTabBar = useBottomChromeStore((s) => s.setTabBar);
  const setMiniBar = useBottomChromeStore((s) => s.setMiniBar);
  useEffect(() => {
    setTabBar(barH);
    return () => setTabBar(0);
  }, [barH, setTabBar]);
  useEffect(() => {
    setMiniBar(showMiniBar ? MINI_BAR_HEIGHT : 0);
  }, [showMiniBar, setMiniBar]);
  useEffect(() => () => setMiniBar(0), [setMiniBar]);

  if (!isAuthenticated) {
    return graceExpired ? <Redirect href="/(auth)/login" /> : null;
  }

  return (
    <View style={styles.root}>
      <RealSafeAreaInsetsContext.Provider value={insets}>
        <SafeAreaInsetsContext.Provider value={screenInsets}>
          <Tabs
            initialRouteName="trips"
            screenOptions={{ headerShown: false }}
            // 같은 탭 다시 누르기에서 스택 맨 아래가 index 가 아니면(외근 종료 뒤 상세만 남은 스택 등) 스택 쪽
            // popToTop 으로는 첫 화면에 못 가고 개발 경고만 남는다 — 기본 동작을 막고 [index] 로 reset 한다.
            screenListeners={({ navigation, route }) => ({
              tabPress: (e) => {
                if (!navigation.isFocused()) return;
                const current = navigation.getState().routes.find((r: { key: string }) => r.key === route.key);
                if (!current || !needsStackReset(current)) return;
                e.preventDefault();
                resetTabStack(navigation, current);
              },
            })}
            tabBar={(props) => <AppTabBar {...props} insetBottom={insets.bottom} />}
          >
            <Tabs.Screen name="trips" options={{ title: '외근' }} />
            <Tabs.Screen name="reports" options={{ title: '보고서' }} />
            <Tabs.Screen name="profile" options={{ title: '내 정보' }} />
          </Tabs>
        </SafeAreaInsetsContext.Provider>
      </RealSafeAreaInsetsContext.Provider>
      {showMiniBar ? <TripMiniBar bottom={barH} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

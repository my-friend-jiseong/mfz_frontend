import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTripStore } from '@/stores/tripStore';
// 루트는 일부러 safe area 패딩 미적용 — map 화면(MapSheetLayout)이 BottomSheet 를 edge-to-edge
// (status bar 영역까지) 노출해야 하기 때문. 비-map 화면 (forms, profile, auth) 은 각자 SafeAreaView
// 로 paddingTop 책임. TripStatusBanner 가 보이면 그게 inset 을 consume 한 것으로 간주해
// 하위 트리에 inset.top=0 을 provider 로 내려보내 비-map 화면이 banner 아래에 또 padding 을
// 추가하는 더블 패딩 회로 차단.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { TripStatusBanner } from '@/components/TripStatusBanner';
import { SessionGuardModal } from '@/components/SessionGuardModal';
import { startSessionActivity, stopSessionActivity } from '@/stores/sessionActivity';
import { startLoginBounceProbe, probeLog } from '@/utils/loginBounceProbe';
import { initSentry } from '@/utils/sentry';
import { applyWebAlertPatch } from '@/utils/webAlertPatch';
import { useAuthStore } from '@/stores/authStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { colors } from '@/theme/colors';
import { FONTS_TO_LOAD } from '@/theme/typography';

// 모듈 로드 시 초기화 (DSN 환경변수 없으면 no-op)
initSentry();
// react-native-web 의 Alert.alert no-op 우회 — 전 코드베이스의 alert 가 web 에서 동작.
applyWebAlertPatch();

// Text.defaultProps monkey-patch 는 React 19 / 미래 RN 의 deprecation 위험 + 라이브러리/
// 시스템 텍스트까지 광범위 영향이라 제거. 대신 ui/* 컴포넌트가 styles 에 fontFamily 명시.

export default function RootLayout() {
  // 부팅 시 보안 저장소의 refresh 토큰으로 세션 복원.
  // 루트에서 트리거해야 웹 새로고침 시 어느 URL이든 자동 로그인이 동작한다
  // (index 라우트는 deep-link 새로고침에서 마운트되지 않음).
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [fontsLoaded, fontError] = useFonts(FONTS_TO_LOAD);

  useEffect(() => {
    startLoginBounceProbe(); // 로그인 직후 백그라운드 전환 버그 실측 — 원인 확정 후 제거
    void hydrate();
    void useDestinationStore.getState().hydrate();
    startSessionActivity();
    return () => {
      stopSessionActivity();
    };
  }, [hydrate]);

  // 폰트 로드 실패 시 console 로 보고하고 진행 — splash 데드락 방지 (OS 폰트 fallback).
  useEffect(() => {
    if (fontError) console.warn('[fonts] Pretendard 로드 실패', fontError);
  }, [fontError]);

  // hydrate / 폰트 로드 끝날 때까지 splash. 폰트 에러 시 OS 폰트로 진입 허용.
  if (isHydrating || (!fontsLoaded && !fontError)) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.center} edges={['top']}>
            <ActivityIndicator color={colors.primary} />
            <StatusBar style="dark" />
          </SafeAreaView>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <RootContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// inset provider 가 SafeAreaProvider 내부에서만 useSafeAreaInsets 호출 가능.
function RootContent() {
  const insets = useSafeAreaInsets();
  // [probe] 라우트 전환 타임라인 — background 전환과의 선후 관계 확인용
  const pathname = usePathname();
  useEffect(() => {
    probeLog('route →', pathname);
  }, [pathname]);
  const bannerVisible = useTripStore((s) => s.activeTripId !== null);
  const downstreamInsets = bannerVisible
    ? { ...insets, top: 0 }
    : insets;

  return (
    <View style={styles.root}>
      <TripStatusBanner />
      <SafeAreaInsetsContext.Provider value={downstreamInsets}>
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </View>
      </SafeAreaInsetsContext.Provider>
      <SessionGuardModal />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});

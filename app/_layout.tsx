import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { TripStatusBanner } from '@/components/TripStatusBanner';
import { SessionGuardModal } from '@/components/SessionGuardModal';
import { startSessionActivity, stopSessionActivity } from '@/stores/sessionActivity';
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
        <SafeAreaView style={styles.root} edges={['top']}>
          <TripStatusBanner />
          <View style={styles.content}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </View>
          <SessionGuardModal />
          <StatusBar style="dark" />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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

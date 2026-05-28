import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { TripStatusBanner } from '@/components/TripStatusBanner';
import { SessionGuardModal } from '@/components/SessionGuardModal';
import { startSessionActivity, stopSessionActivity } from '@/stores/sessionActivity';
import { initSentry } from '@/utils/sentry';
import { applyWebAlertPatch } from '@/utils/webAlertPatch';
import { useAuthStore } from '@/stores/authStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { colors } from '@/theme/colors';
import { FONTS_TO_LOAD, fontFamily } from '@/theme/typography';

// 모듈 로드 시 초기화 (DSN 환경변수 없으면 no-op)
initSentry();
// react-native-web 의 Alert.alert no-op 우회 — 전 코드베이스의 alert 가 web 에서 동작.
applyWebAlertPatch();

// 모든 <Text> 의 기본 fontFamily 를 Pretendard 로. 토큰 미사용 화면에도 자동 적용 —
// 폰트 로드 전엔 OS fallback, 로드 후엔 Pretendard 로 자동 교체.
const TextWithDefaults = Text as unknown as { defaultProps?: { style?: unknown } };
if (!TextWithDefaults.defaultProps) TextWithDefaults.defaultProps = {};
TextWithDefaults.defaultProps.style = [
  { fontFamily: fontFamily.regular },
  TextWithDefaults.defaultProps.style,
];

export default function RootLayout() {
  // 부팅 시 보안 저장소의 refresh 토큰으로 세션 복원.
  // 루트에서 트리거해야 웹 새로고침 시 어느 URL이든 자동 로그인이 동작한다
  // (index 라우트는 deep-link 새로고침에서 마운트되지 않음).
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [fontsLoaded] = useFonts(FONTS_TO_LOAD);

  useEffect(() => {
    void hydrate();
    void useDestinationStore.getState().hydrate();
    startSessionActivity();
    return () => {
      stopSessionActivity();
    };
  }, [hydrate]);

  // hydrate / 폰트 로드 끝날 때까지 splash. 토큰 없이 API 호출이 새거나
  // 시스템 폰트로 그렸다가 Pretendard 로 점프하는 flicker 차단.
  if (isHydrating || !fontsLoaded) {
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

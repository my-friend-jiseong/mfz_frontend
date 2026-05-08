import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { TripStatusBanner } from '@/components/TripStatusBanner';
import { SessionGuardModal } from '@/components/SessionGuardModal';
import { OfflineBadge } from '@/components/OfflineBadge';
import { startSessionActivity, stopSessionActivity } from '@/stores/sessionActivity';
import { startNetworkWatcher, stopNetworkWatcher } from '@/api/network';
import { initSentry } from '@/utils/sentry';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';

// 모듈 로드 시 초기화 (DSN 환경변수 없으면 no-op)
initSentry();

export default function RootLayout() {
  // 부팅 시 보안 저장소의 refresh 토큰으로 세션 복원.
  // 루트에서 트리거해야 웹 새로고침 시 어느 URL이든 자동 로그인이 동작한다
  // (index 라우트는 deep-link 새로고침에서 마운트되지 않음).
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
    startSessionActivity();
    startNetworkWatcher();
    return () => {
      stopSessionActivity();
      stopNetworkWatcher();
    };
  }, [hydrate]);

  // hydrate 가 끝나기 전엔 자식 라우트 렌더를 막아 토큰 없이 API 호출이 새는 것을 방지.
  if (isHydrating) {
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
          <OfflineBadge />
          <View style={styles.content}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="shared/[token]" />
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

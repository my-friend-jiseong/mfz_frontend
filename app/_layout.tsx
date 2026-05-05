import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { TripStatusBanner } from '@/components/TripStatusBanner';
import { SessionGuardModal } from '@/components/SessionGuardModal';
import { OfflineBadge } from '@/components/OfflineBadge';
import { startSessionActivity, stopSessionActivity } from '@/stores/sessionActivity';
import { startNetworkWatcher, stopNetworkWatcher } from '@/api/network';
import { initSentry } from '@/utils/sentry';
import { colors } from '@/theme/colors';

// 모듈 로드 시 초기화 (DSN 환경변수 없으면 no-op)
initSentry();

export default function RootLayout() {
  useEffect(() => {
    startSessionActivity();
    startNetworkWatcher();
    return () => {
      stopSessionActivity();
      stopNetworkWatcher();
    };
  }, []);

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
});

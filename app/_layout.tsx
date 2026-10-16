import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
// 루트는 일부러 safe area 패딩 미적용 — map 화면(MapSheetLayout)이 BottomSheet 를 edge-to-edge
// (status bar 영역까지) 노출해야 하기 때문. 비-map 화면 (forms, profile, auth) 은 각자 SafeAreaView
// 로 paddingTop 책임. 외근 중 표시는 위 배너가 아니라 탭 바 위 미니 바(7-4)라 위쪽 inset 을 건드리지 않는다.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SessionGuardModal } from '@/components/SessionGuardModal';
import { ActionSheetHost, ConfirmDialogHost, PopoverMenuHost, ToastHost } from '@/components/ui';
import { startSessionActivity, stopSessionActivity } from '@/stores/sessionActivity';
import { initSentry } from '@/utils/sentry';
import { applyWebAlertPatch } from '@/utils/webAlertPatch';
import { useAuthStore } from '@/stores/authStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useTripPrepStore } from '@/stores/tripPrepStore';
import { startCheckinQueue, useCheckinQueueStore } from '@/stores/checkinQueueStore';
import { useTripStore } from '@/stores/tripStore';
import { startAnalyticsActivity } from '@/utils/analyticsActivity';
import { colors } from '@/theme/colors';
import { FONTS_TO_LOAD } from '@/theme/typography';

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
    initSentry();
    void hydrate();
    void useDestinationStore.getState().hydrate();
    // 외근 전에 담은 목적지(6 외근 준비)·체크인 저장 대기열(7-2·7-3)도 부팅 때 읽는다.
    void useTripPrepStore.getState().hydrate();
    const stopCheckinQueue = startCheckinQueue({
      getUserId: () => {
        const a = useAuthStore.getState();
        return a.isAuthenticated ? (a.user?.id ?? null) : null;
      },
      getActiveTripId: () => {
        const t = useTripStore.getState();
        return t.activeResolved ? t.activeTripId : undefined;
      },
    });
    // 로그인 사용자가 바뀌면 다른 사용자의 대기열을 지우고, 진행 중 외근을 알게 되면 대기열을 보낸다.
    const unsubAuth = useAuthStore.subscribe((a, prev) => {
      const id = a.isAuthenticated ? (a.user?.id ?? null) : null;
      const prevId = prev.isAuthenticated ? (prev.user?.id ?? null) : null;
      if (id !== prevId) useCheckinQueueStore.getState().onUserChange(id);
    });
    const unsubTrip = useTripStore.subscribe((t, prev) => {
      if (t.activeResolved && (!prev.activeResolved || t.activeTripId !== prev.activeTripId)) {
        void useCheckinQueueStore.getState().flush();
      }
    });
    startSessionActivity();
    const stopAnalytics = startAnalyticsActivity();
    return () => {
      stopSessionActivity();
      stopAnalytics();
      stopCheckinQueue();
      unsubAuth();
      unsubTrip();
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
        {/* BottomSheetModal(지도 설정 시트 등) 을 트리 최상단 포털로 띄우기 위한 provider. */}
        <BottomSheetModalProvider>
          <RootContent />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootContent() {
  return (
    <View style={styles.root}>
      {/* animation:'none' — 루트 전환은 auth↔tabs 뿐. 전환 애니메이션 동안 RNSScreen 이
          removeView 를 보류(startViewTransition)해, 같은 배치의 뷰 재부모화와 충돌 시
          Fabric FATAL(screens#3249). 애니메이션 제거로 보류 윈도우 자체를 차단(2중 방어).
          (modals) 만 예외 — 사용자가 누른 버튼으로만 열리고 같은 배치에 화면 교체가 없다. */}
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        {/* X 로 닫는 모달 — 탭 바까지 덮는다(인수인계 §2 공통). */}
        <Stack.Screen
          name="(modals)"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
        />
      </Stack>
      <SessionGuardModal />
      {/* 명세 v2 공용 오버레이 — 화면 전환(replace) 직후에도 살아 있도록 스택 밖에 둔다. */}
      <ToastHost />
      <ActionSheetHost />
      <PopoverMenuHost />
      <ConfirmDialogHost />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});

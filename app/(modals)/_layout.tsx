import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';

// X 로 닫는 모달(인수인계 §2 공통 '탭 바를 가리는 화면'). 루트 스택에 fullScreenModal 로 올라가
// 탭 바까지 덮는다 — 탭 화면 스택 안에서 탭 바를 숨기는 방식은 전환 중 깜빡임이 생겨 쓰지 않는다.
// 표시 방식은 루트 app/_layout.tsx 의 (modals) 항목에서 정한다.
export default function ModalsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // 웹 새로 고침·딥링크로 모달부터 열리면 (tabs) 가 아직 외근을 받지 않았다 — 진행 중 외근을 알아야 하는 모달(체크인 등)을 위해 받는다.
  // 탭에서 열린 경우엔 이미 받았으니 다시 부르지 않는다.
  useEffect(() => {
    if (isAuthenticated && !useTripStore.getState().activeResolved) void useTripStore.getState().hydrate();
  }, [isAuthenticated]);
  // 웹에서 /map 등으로 바로 들어온 미인증 사용자 — (tabs) 와 같은 게이트.
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  // iOS 의 네이티브 모달은 별도 창이라 루트 provider 의 포털(AppSheet)이 모달 뒤에 그려진다 — 모달 안에 provider 를 하나 더 둔다.
  return (
    <BottomSheetModalProvider>
      {/* 모달 위에 여는 모달(8 체크인 → 현장 정보 수정, 9-2 → 현장 보고·위치도)도 아래에서 올라오게 — 기본은 옆에서 밀려 들어와
          '모달 안의 다음 단계'처럼 보였다. */}
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }} />
    </BottomSheetModalProvider>
  );
}

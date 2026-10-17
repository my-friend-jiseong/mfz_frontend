import { Stack } from 'expo-router';

// 탭 다시 누르기·딥 링크에서 첫 화면(index)이 스택 맨 아래에 있도록.
export const unstable_settings = { initialRouteName: 'index' };

// 9 보고서 목록 → 9-3 보고서 상세(푸시, 탭 바 유지). 9-2·9-6·9-7·9-8·9-11 은 X 로 닫는 모달이라
// 루트 (modals) 스택에 있다(탭 바를 가림).
export default function ReportsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]/index" />
    </Stack>
  );
}

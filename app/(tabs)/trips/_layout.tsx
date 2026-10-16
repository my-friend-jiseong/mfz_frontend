import { Stack } from 'expo-router';
import { flushAfterPush } from '@/utils/afterPush';

// 딥 링크(/trips/fields/123 등)로 바로 들어와도 스택 맨 아래에 외근 탭 첫 화면을 깔아,
// 뒤로·탭 다시 누르기가 첫 화면으로 돌아오게 한다.
export const unstable_settings = { initialRouteName: 'index' };

// 외근 탭 스택. 현장 화면(4 현장 검색·5 현장 상세)도 외근 탭 소속이라 여기 둔다(trips/fields/...).
export default function TripsLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      // 외근 종료 직후 정리(첫 화면을 목록으로 되돌리기 등)는 상세 화면 push 전환이 끝난 뒤에(afterPush.ts).
      screenListeners={{
        transitionEnd: (e) => {
          if (!e.data?.closing) flushAfterPush();
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="active" />
      <Stack.Screen name="prep" />
      <Stack.Screen name="fields/index" />
      <Stack.Screen name="fields/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="fields/place" />
      <Stack.Screen name="fields/[id]/index" />
    </Stack>
  );
}

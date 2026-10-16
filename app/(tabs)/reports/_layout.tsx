import { Stack } from 'expo-router';

// 탭 다시 누르기·딥 링크에서 첫 화면(index)이 스택 맨 아래에 있도록.
export const unstable_settings = { initialRouteName: 'index' };

// 명세 v2 — 보고서 작성·현장 보고·보고서 수정은 푸시 화면이고 각자 NavHeader(← + 제목)를 그린다.
// 보고서 작성은 모달이었지만 외근 정리·체크인에서 이어지는 흐름의 한 단계라 푸시로 바꿨다.
export default function ReportsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/field-report" />
    </Stack>
  );
}

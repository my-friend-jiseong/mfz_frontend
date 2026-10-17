import { Stack } from 'expo-router';

// 탭 다시 누르기·딥 링크에서 첫 화면(index)이 스택 맨 아래에 있도록.
export const unstable_settings = { initialRouteName: 'index' };

// 2차: 머리는 화면이 직접 그린다(PageHeader). 앱 안 문의 화면·카테고리 관리는 없앴다
// (문의는 메일 앱, 분류는 현장 화면의 분류 시트).
export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="delete-account" />
    </Stack>
  );
}

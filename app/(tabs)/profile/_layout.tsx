import { Stack } from 'expo-router';

// 탭 다시 누르기·딥 링크에서 첫 화면(index)이 스택 맨 아래에 있도록.
export const unstable_settings = { initialRouteName: 'index' };

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="support" options={{ title: '문의하기', headerShown: true }} />
      <Stack.Screen
        name="edit"
        options={{ title: '내 정보 수정', headerShown: true }}
      />
      <Stack.Screen
        name="categories"
        options={{ title: '카테고리 관리', headerShown: true }}
      />
      <Stack.Screen
        name="delete-account"
        options={{ title: '계정 삭제', headerShown: true }}
      />
    </Stack>
  );
}

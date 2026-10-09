import { Stack } from 'expo-router';

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

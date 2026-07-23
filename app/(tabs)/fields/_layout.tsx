import { Stack } from 'expo-router';

export default function FieldsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="categories" options={{ title: '카테고리 관리', headerShown: true }} />
      <Stack.Screen name="[id]/edit" options={{ title: '현장 수정', headerShown: true }} />
      <Stack.Screen name="[id]/checkin" options={{ title: '체크인·기록', headerShown: true }} />
    </Stack>
  );
}

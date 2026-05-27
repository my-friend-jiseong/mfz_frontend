import { Stack } from 'expo-router';

export default function ReportsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="new"
        options={{ title: '새 보고서', presentation: 'modal', headerShown: true }}
      />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen
        name="[id]/edit"
        options={{ title: '보고서 수정', headerShown: true }}
      />
      <Stack.Screen
        name="[id]/field-report"
        options={{ title: '현장 보고', headerShown: true }}
      />
    </Stack>
  );
}

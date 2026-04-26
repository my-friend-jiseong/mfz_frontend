import { Stack } from 'expo-router';

export default function TripsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="active" />
      <Stack.Screen name="new/select" />
      <Stack.Screen name="new/order" />
    </Stack>
  );
}

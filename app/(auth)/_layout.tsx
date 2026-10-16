import { Stack } from 'expo-router';

// 로그인 계열은 루트 Stack 의 (auth) 그룹이라 탭 바가 없다.
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      {/* 11-4~11-8 비밀번호 찾기 — 진입 링크는 FEATURE_PASSWORD_RESET 뒤에 숨김. */}
      <Stack.Screen name="password-reset/index" />
      <Stack.Screen name="password-reset/code" />
      <Stack.Screen name="password-reset/new-password" />
    </Stack>
  );
}

import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

// X 로 닫는 모달(인수인계 §2 공통 '탭 바를 가리는 화면'). 루트 스택에 fullScreenModal 로 올라가
// 탭 바까지 덮는다 — 탭 화면 스택 안에서 탭 바를 숨기는 방식은 전환 중 깜빡임이 생겨 쓰지 않는다.
// 표시 방식은 루트 app/_layout.tsx 의 (modals) 항목에서 정한다.
export default function ModalsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // 웹에서 /map 등으로 바로 들어온 미인증 사용자 — (tabs) 와 같은 게이트.
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

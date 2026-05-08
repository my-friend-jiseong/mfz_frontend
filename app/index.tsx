import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

// hydrate 는 루트 레이아웃(app/_layout.tsx)에서 트리거된다.
// 여기 도달 시점엔 isHydrating=false 가 보장되므로 인증 상태에 따라 분기만 한다.
export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/login'} />;
}

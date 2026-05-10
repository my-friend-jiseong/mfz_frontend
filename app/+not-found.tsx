import { Redirect } from 'expo-router';

// expo-router 가 매칭 못 한 모든 경로의 fallback. 사용자가 잘못된 URL/리프레시/back 으로
// 흰 화면에 떨어지는 회로를 외근 탭으로 흡수.
export default function NotFound() {
  return <Redirect href="/(tabs)/trips" />;
}

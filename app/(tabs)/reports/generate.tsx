import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

// 보고서 작성 화면이 통합되면서 /reports/generate 는 /reports/new 로 redirect.
// 외부 링크/스토리지 등 기존 경로 백호환을 위해 라우트 자체는 유지.
export default function GenerateRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  useEffect(() => {
    const target = params.tripId
      ? `/(tabs)/reports/new?tripId=${params.tripId}`
      : '/(tabs)/reports/new';
    router.replace(target as never);
  }, [params.tripId, router]);

  return <View />;
}

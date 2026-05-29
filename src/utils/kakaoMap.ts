import { Alert, Platform } from 'react-native';
import * as Linking from 'expo-linking';

// 카카오맵 길찾기 열기.
// 모바일은 앱 스킴 우선, 실패/웹은 map.kakao.com 폴백.
// 출발지(sp)는 지정하지 않아 카카오맵이 사용자의 현재 위치를 사용.
export async function openKakaoRouteTo(
  name: string,
  lat: number,
  lng: number,
): Promise<void> {
  const webUrl = `https://map.kakao.com/link/to/${encodeURIComponent(
    name,
  )},${lat},${lng}`;

  if (Platform.OS === 'web') {
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert('카카오맵 열기 실패', '브라우저가 외부 링크를 차단했을 수 있습니다.');
    }
    return;
  }

  const appUrl = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
  try {
    const ok = await Linking.canOpenURL(appUrl);
    await Linking.openURL(ok ? appUrl : webUrl);
  } catch {
    // 1차 fallback — webUrl. 그것도 실패하면 사용자 안내.
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert(
        '카카오맵 열기 실패',
        '카카오맵 앱과 웹 둘 다 열 수 없습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }
}

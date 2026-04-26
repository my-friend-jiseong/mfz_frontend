import { Platform } from 'react-native';
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
    await Linking.openURL(webUrl);
    return;
  }

  const appUrl = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
  try {
    const ok = await Linking.canOpenURL(appUrl);
    await Linking.openURL(ok ? appUrl : webUrl);
  } catch {
    await Linking.openURL(webUrl);
  }
}

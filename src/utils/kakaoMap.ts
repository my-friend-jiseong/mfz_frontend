import { Alert, Platform } from 'react-native';
import * as Linking from 'expo-linking';

// 카카오 지도/검색 SDK 는 요청 도메인(Referer)을 카카오 디벨로퍼스의 등록 웹 플랫폼과 대조한다.
// 네이티브 WebView 가 source={{ html }} 로 인라인 로드하면 origin 이 about:blank 라 Referer 가 비어
// SDK 가 거부된다(지도 백지). source 에 등록 도메인을 baseUrl 로 지정해 그 origin 으로 통과시킨다.
// 값은 카카오 디벨로퍼스에 등록된 웹 도메인과 정확히 일치해야 한다.
export const KAKAO_WEBVIEW_BASE_URL = 'https://app.ilgayo.co.kr';

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

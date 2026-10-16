import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { notice } from '@/components/ui/ConfirmDialog';

// 길찾기(7-5, 5 현장 상세 [길찾기]) — 카카오맵 앱으로 넘긴다(결정: 외부 앱 딥링크).
// 앱이 없거나 웹이면 카카오맵 웹 길찾기. 출발지(sp)를 주지 않으면 카카오맵이 지금 위치에서 시작한다.

export interface RouteTarget {
  name: string;
  lat: number;
  lng: number;
}

export function kakaoRouteAppUrl(to: RouteTarget, from?: { lat: number; lng: number } | null): string {
  const sp = from ? `sp=${from.lat},${from.lng}&` : '';
  return `kakaomap://route?${sp}ep=${to.lat},${to.lng}&by=CAR`;
}

export function kakaoRouteWebUrl(to: RouteTarget): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(to.name)},${to.lat},${to.lng}`;
}

export async function openRouteTo(to: RouteTarget, from?: { lat: number; lng: number } | null): Promise<void> {
  const webUrl = kakaoRouteWebUrl(to);
  try {
    if (Platform.OS !== 'web') {
      // canOpenURL 은 안드로이드 11+ 에서 <queries> 선언 없이는 늘 false 라 바로 열어 보고 실패하면 웹으로.
      const opened = await Linking.openURL(kakaoRouteAppUrl(to, from)).then(
        () => true,
        () => false,
      );
      if (opened) return;
    }
    if (Platform.OS === 'web') {
      // 웹은 새 탭 — 같은 탭으로 가면 앱 상태(담은 목적지 등)를 잃는다.
      // 'noopener' 를 주면 window.open 이 늘 null 을 돌려줘 차단 여부를 못 안다 — 열고 나서 opener 를 끊는다.
      const w = window.open(webUrl, '_blank');
      if (!w) throw new Error('popup blocked');
      w.opener = null;
      return;
    }
    await Linking.openURL(webUrl);
  } catch {
    await notice('카카오맵을 열 수 없어요', '잠시 뒤에 다시 해 주세요.');
  }
}

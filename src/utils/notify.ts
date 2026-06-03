import { Alert, Platform } from 'react-native';

// 정보성 1버튼 알림 — react-native-web 의 Alert.alert 는 no-op 이라 web 은
// window.alert 로 폴백 (삭제 확인류 confirm() 패턴과 동일한 관례).
// 확인/취소가 필요한 분기는 이 유틸 대상이 아님 — 각 화면의 confirm 패턴 유지.
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

import { Alert, Platform, type AlertButton } from 'react-native';

// react-native-web 의 Alert 는 static alert() {} — 완전한 no-op.
// 결과적으로 web 에선 모든 Alert.alert 호출이 침묵하고 onPress 콜백조차 안 돈다.
// (예: 외근 종료 confirm, 종료 후 AI 보고서 prompt, 삭제 확인 등 모두 실종)
//
// 호출처마다 Platform.OS === 'web' 분기를 추가하는 것은 50+곳 수정과 회귀 위험.
// 이 모듈에서 한 번 monkey-patch 해 window.alert/confirm 으로 대체하고, onPress
// 콜백도 정상 호출되도록 한다. 모듈 import 시 1회 적용.

let patched = false;

export function applyWebAlertPatch(): void {
  if (Platform.OS !== 'web' || patched) return;
  patched = true;

  type LegacyAlert = {
    alert: (
      title: string,
      message?: string,
      buttons?: AlertButton[],
    ) => void;
  };
  const target = Alert as unknown as LegacyAlert;

  target.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n');
    if (!buttons || buttons.length === 0) {
      window.alert(text);
      return;
    }
    if (buttons.length === 1) {
      window.alert(text);
      buttons[0]?.onPress?.();
      return;
    }
    // 다중 버튼: window.confirm 으로 OK/Cancel 양분.
    // OK → cancel 스타일이 아닌 첫 버튼 onPress.
    // Cancel → cancel 스타일 버튼 onPress (있으면).
    const ok = window.confirm(text);
    if (ok) {
      const okButton = buttons.find((b) => b.style !== 'cancel');
      okButton?.onPress?.();
    } else {
      const cancelButton = buttons.find((b) => b.style === 'cancel');
      cancelButton?.onPress?.();
    }
  };
}

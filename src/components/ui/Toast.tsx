import { snackbar, SnackbarHost } from './Snackbar';

// 2차부터 토스트는 스낵바(Snackbar.tsx)로 그린다. 기존 호출부(`toast('…')`)는 그대로 두고 여기서 넘긴다.
// icon 은 2차 스낵바에 아이콘 자리가 없어 무시한다(호출부 타입만 유지).
export function toast(message: string, _opts?: { icon?: string }) {
  snackbar.show({ message });
}

export const ToastHost = SnackbarHost;

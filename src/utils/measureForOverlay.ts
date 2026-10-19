import { Platform, StatusBar } from 'react-native';

export interface Measurable {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
}

/**
 * 창 전체를 덮는 오버레이(statusBarTranslucent Modal) 좌표로 뷰 위치를 잰다.
 * 안드로이드 measureInWindow 는 y 에서 상태 표시줄 높이를 뺀 값을 준다(보이는 영역 기준). 앱은 edge-to-edge 라
 * 오버레이는 화면 맨 위부터 그리므로, 그대로 쓰면 메뉴가 상태 표시줄 높이만큼 위로 뜬다(실기기 SM-N981N: 92px).
 * 차이만 쓰는 곳(SortableList)은 상쇄되므로 그대로 둔다.
 */
export function measureForOverlay(view: Measurable, cb: (x: number, y: number, w: number, h: number) => void): void {
  view.measureInWindow((x, y, w, h) => {
    const top = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
    cb(x, y + top, w, h);
  });
}

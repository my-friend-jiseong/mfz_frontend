import { createContext, useContext } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

// 탭 레이아웃은 탭 화면들에 bottom inset 0 을 내려 준다(탭 바가 홈 인디케이터 자리를 먹으므로).
// 그런데 화면 안에서 띄우지만 실제로는 창 전체에 그려지는 것(gorhom BottomSheetModal 포털, RN Modal)은
// 탭 바 위가 아니라 화면 맨 아래까지 내려오므로 진짜 inset 이 필요하다. 탭 레이아웃이 원래 값을 여기 넣는다.
export const RealSafeAreaInsetsContext = createContext<EdgeInsets | null>(null);

/** 창 기준 safe area. 탭 화면의 0 덮어쓰기를 무시한다. 탭 밖에서는 useSafeAreaInsets 와 같다. */
export function useRealSafeAreaInsets(): EdgeInsets {
  const local = useSafeAreaInsets();
  return useContext(RealSafeAreaInsetsContext) ?? local;
}

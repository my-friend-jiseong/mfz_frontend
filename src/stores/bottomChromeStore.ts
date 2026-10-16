import { create } from 'zustand';

// 화면 아래에 겹쳐 붙는 앱 셸 요소(탭 바·미니 바·탭 화면 하단 버튼 바)의 높이.
// 스낵바 호스트는 루트(탭 네비게이터 밖)에 있어 context 로는 못 받으므로 스토어로 나눈다.
// 값은 safe area 를 포함한 실제 높이(px). 0 이면 그 요소가 지금 안 보인다는 뜻.
interface BottomChromeState {
  /** 탭 바 높이(safe area 포함). 탭 바가 없는 화면(모달·로그인)에서는 0. */
  tabBar: number;
  /** 미니 바(7-4)가 차지하는 높이(위아래 여백 포함). */
  miniBar: number;
  /** 지금 보이는 탭 화면의 하단 버튼 바 높이. */
  footer: number;
  setTabBar: (h: number) => void;
  setMiniBar: (h: number) => void;
  setFooter: (h: number) => void;
}

export const useBottomChromeStore = create<BottomChromeState>((set) => ({
  tabBar: 0,
  miniBar: 0,
  footer: 0,
  setTabBar: (tabBar) => set((s) => (s.tabBar === tabBar ? s : { tabBar })),
  setMiniBar: (miniBar) => set((s) => (s.miniBar === miniBar ? s : { miniBar })),
  setFooter: (footer) => set((s) => (s.footer === footer ? s : { footer })),
}));

/**
 * 미니 바(7-4)가 지금 차지하는 높이. 미니 바가 뜨는 탭 첫 화면(9 보고서 목록·10 내 정보)이 목록 끝 여백에 더한다.
 * 탭 레이아웃의 sceneStyle 로 화면 전체를 줄이면 푸시·팝·키보드마다 모든 탭 화면 높이가 출렁여서 화면 안에서 처리한다.
 */
export const useMiniBarInset = () => useBottomChromeStore((s) => s.miniBar);

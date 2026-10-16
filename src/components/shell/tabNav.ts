import { router } from 'expo-router';
import { CommonActions, StackActions, type NavigationState, type PartialState } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export type TabName = 'trips' | 'reports' | 'profile';
type TabsNavigation = BottomTabBarProps['navigation'];
type TabRoute = NavigationState['routes'][number];
type NestedState = NavigationState | PartialState<NavigationState> | undefined;

// 탭 네비게이터 핸들 — AppTabBar 가 마운트될 때 넣고 내려갈 때 뺀다. 탭 밖(미니 바·다른 탭 화면)에서
// '그 탭 첫 화면으로' 이동할 때 쓴다.
let tabsNav: TabsNavigation | null = null;
/** 등록하고, 해제 함수를 돌려준다(그사이 다른 핸들로 바뀌었으면 건드리지 않음). */
export function registerTabsNavigation(nav: TabsNavigation): () => void {
  tabsNav = nav;
  return () => {
    if (tabsNav === nav) tabsNav = null;
  };
}

/** 그 탭 스택의 맨 아래가 index 가 아닌가(외근 종료 뒤 상세만 남은 스택 등) — popToTop 으로는 첫 화면에 못 간다. */
export function needsStackReset(route: TabRoute): boolean {
  const nested = route.state as NestedState;
  const first = nested?.routes?.[0]?.name;
  return !!nested && first !== undefined && first !== 'index';
}

/**
 * 탭 스택을 첫 화면(index) 하나만 남게 되돌린다. 되돌렸거나 이미 첫 화면이면 true,
 * 스택 상태가 아직 부분 상태(key 없음, 딥 링크 직후)라 손대지 못했으면 false.
 */
export function resetTabStack(nav: Pick<TabsNavigation, 'dispatch'>, route: TabRoute): boolean {
  const nested = route.state as NestedState;
  if (!nested) return true;
  const routes = nested.routes ?? [];
  const rootIsIndex = routes[0]?.name === 'index';
  if (routes.length <= 1 && rootIsIndex) return true;
  if (!nested.key) return false;
  if (rootIsIndex) {
    nav.dispatch({ ...StackActions.popToTop(), target: nested.key });
  } else {
    nav.dispatch({ ...CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }), target: nested.key });
  }
  return true;
}

function findTab(nav: TabsNavigation, tab: TabName) {
  const state = nav.getState();
  return { state, route: state.routes.find((r) => r.name === tab) };
}

/** 지금 보고 있지 않은 탭의 스택을 첫 화면으로 되돌린다(떠난 탭에 입력 화면이 남지 않게). */
export function resetTab(tab: TabName): void {
  const nav = tabsNav;
  if (!nav) return;
  const { route } = findTab(nav, tab);
  if (route) resetTabStack(nav, route);
}

/**
 * 그 탭의 첫 화면(1·7 / 9 / 10)으로. 다른 탭에서 불러도 된다 — 탭을 바꾸고 그 탭 스택을 [index] 로 되돌린다.
 * router.navigate('/(tabs)/trips') 는 스택 상태에 따라 index 를 하나 더 쌓을 수 있어 쓰지 않는다.
 * resetFrom: 떠나는 탭의 스택도 첫 화면으로(전환이 끝난 다음 프레임에 — 떠나는 화면을 같은 배치에서 바꾸지 않는다).
 */
export function goToTabRoot(tab: TabName, { resetFrom }: { resetFrom?: TabName } = {}): void {
  const nav = tabsNav;
  if (!nav) {
    router.navigate(`/(tabs)/${tab}` as never);
    return;
  }
  const { state, route } = findTab(nav, tab);
  if (!route) return;
  if (state.routes[state.index]?.key !== route.key) {
    nav.dispatch({ ...CommonActions.navigate(route), target: state.key });
  }
  if (!resetTabStack(nav, route)) {
    // 부분 상태 — 한 프레임 뒤 새 상태로 한 번 더, 그래도 안 되면 주소로.
    requestAnimationFrame(() => {
      const again = findTab(nav, tab).route;
      if (!again || !resetTabStack(nav, again)) router.navigate(`/(tabs)/${tab}` as never);
    });
  }
  if (resetFrom && resetFrom !== tab) requestAnimationFrame(() => resetTab(resetFrom));
}

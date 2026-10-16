import { router } from 'expo-router';
import { CommonActions, StackActions, type NavigationState, type PartialState } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export type TabName = 'trips' | 'reports' | 'profile';
type TabsNavigation = BottomTabBarProps['navigation'];
type TabRoute = NavigationState['routes'][number];
type NestedState = NavigationState | PartialState<NavigationState> | undefined;

// 탭 네비게이터 핸들 — AppTabBar 가 그릴 때마다 넣는다. 탭 밖(미니 바·다른 탭 화면)에서
// '그 탭 첫 화면으로' 이동할 때 쓴다.
let tabsNav: TabsNavigation | null = null;
export function registerTabsNavigation(nav: TabsNavigation): void {
  tabsNav = nav;
}

/**
 * 탭 스택을 첫 화면(index) 하나만 남게 되돌린다.
 * - 이미 [index] 뿐이면 아무것도 안 한다.
 * - 맨 아래가 index 면 popToTop. skipPopToTop 이면 이 경우를 건너뛴다 — 같은 탭 다시 누르기에서는
 *   스택 쪽 tabPress 리스너가 popToTop 을 하므로 두 번 하면 'action was not handled' 가 난다.
 * - 맨 아래가 index 가 아니면(외근 상세만 남은 스택 등) [index] 로 reset.
 */
export function resetTabStack(
  nav: TabsNavigation,
  route: TabRoute,
  { skipPopToTop = false }: { skipPopToTop?: boolean } = {},
): void {
  const nested = route.state as NestedState;
  if (!nested) return;
  const routes = nested.routes ?? [];
  const rootIsIndex = routes[0]?.name === 'index';
  if (routes.length <= 1 && rootIsIndex) return;
  if (rootIsIndex) {
    if (skipPopToTop || !nested.key) return;
    nav.dispatch({ ...StackActions.popToTop(), target: nested.key });
    return;
  }
  if (nested.key) {
    nav.dispatch({ ...CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }), target: nested.key });
  } else {
    nav.navigate(route.name, { screen: 'index' });
  }
}

/**
 * 그 탭의 첫 화면(1·7 / 9 / 10)으로. 다른 탭에서 불러도 된다 — 탭을 바꾸고 그 탭 스택을 [index] 로 되돌린다.
 * router.navigate('/(tabs)/trips') 는 스택 상태에 따라 index 를 하나 더 쌓을 수 있어 쓰지 않는다.
 */
export function goToTabRoot(tab: TabName): void {
  const nav = tabsNav;
  if (!nav) {
    router.navigate(`/(tabs)/${tab}` as never);
    return;
  }
  const state = nav.getState();
  const route = state.routes.find((r) => r.name === tab);
  if (!route) return;
  if (state.routes[state.index]?.key !== route.key) {
    nav.dispatch({ ...CommonActions.navigate(route), target: state.key });
  }
  resetTabStack(nav, route);
}

import { useEffect } from 'react';
import { useNavigation } from 'expo-router';
import { CommonActions, StackActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { goToTabRoot, type TabName } from './tabNav';

/**
 * 그 탭 첫 화면으로 보내는 <Redirect> 대용. 같은 스택 안에서 <Redirect href="/(tabs)/trips"> 를 쓰면
 * replace 로 index 가 하나 더 쌓인다 — 이것은 스택을 [index] 로 되돌린다.
 * 그 탭 스택 안에서 쓰면 자기 스택 navigation 으로 바로 되돌린다(딥 링크 직후엔 탭 쪽 상태가 아직
 * 부분 상태라 탭 네비게이터를 거치면 놓친다). 다른 탭이면 goToTabRoot.
 */
export function TabRootRedirect({ tab }: { tab: TabName }) {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  useEffect(() => {
    // 마운트 직후(딥 링크 첫 렌더)에는 스택이 아직 액션을 받지 못해 popToTop 이 버려진다 — 한 프레임 뒤에.
    const id = requestAnimationFrame(() => {
      const state = nav.getState();
      // 이 스택이 어느 탭의 것인지 — 리다이렉트 화면은 지금 보이는 화면이므로 부모(탭)의 포커스 탭이 곧 이 스택이다.
      const parent = nav.getParent()?.getState();
      const myTab = parent ? parent.routes[parent.index]?.name : undefined;
      const inThisStack = !!state && myTab === tab;
      if (!inThisStack) {
        goToTabRoot(tab);
        return;
      }
      if (state.routes[0]?.name === 'index' && state.routes.length > 1) {
        nav.dispatch(StackActions.popToTop());
      } else if (state.routes[0]?.name !== 'index') {
        nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
      }
    });
    return () => cancelAnimationFrame(id);
  }, [nav, tab]);
  return null;
}

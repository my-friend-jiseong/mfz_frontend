import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

// 비-map 화면용 safe area wrapper. 루트 _layout 에서 SafeAreaView 가 빠진 후, 비-map 화면
// (forms / profile / auth / navigate 등) 이 status bar 밑에 깔리지 않도록 각자 두름.
//
// ★ 외근 배너가 보이면 root 가 provider 로 inset.top=0 을 내려보낸다(배너가 status bar 를 덮는다).
//   그런데 네이티브 SafeAreaView 는 provider 가 아니라 **뷰의 실제 위치**로 inset 을 재서, 배너 아래에서도
//   top 을 한 번 더 더했다(에뮬레이터 실측 2026-09-30: 체크인 헤더가 배너 아래 ~130px 떨어짐).
//   그래서 provider top 이 0 이면(=배너가 이미 소비) top edge 를 빼고, 아니면 네이티브에 맡긴다.
//   전부 useSafeAreaInsets 패딩으로 바꾸면 반대로 네이티브 헤더 아래·iOS 페이지 시트 안에서
//   status bar 높이만큼 이중 여백이 생긴다(리뷰) — 네이티브의 '뷰 기준' 측정이 그 경우엔 옳다.
//
// 기본 edges 는 'top' 만 — 대부분의 사용처가 탭바(하단 inset 자체 소비) 위에 얹히는 탭 화면이라
// 하단까지 두르면 탭바와 이중 여백이 생긴다. 탭바가 없는 화면(auth login/signup 등)에서 하단
// 콘텐츠가 제스처 바에 잘리면 edges={['top','bottom']} 으로 호출해 하단도 보호한다.
export function SafeScreen({
  children,
  edges = ['top'],
}: {
  children: ReactNode;
  edges?: readonly Edge[];
}) {
  const providerTop = useSafeAreaInsets().top;
  const effective = providerTop === 0 ? edges.filter((e) => e !== 'top') : edges;
  return (
    <SafeAreaView style={styles.root} edges={effective}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});

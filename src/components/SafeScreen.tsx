import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

// 비-map 화면용 safe area wrapper. 루트 _layout 에서 SafeAreaView 가 빠진 후, 비-map 화면
// (forms / profile / auth / navigate 등) 이 status bar 밑에 깔리지 않도록 각자 두름.
// TripStatusBanner 가 보이는 상태에선 root 가 inset.top=0 을 provider 로 내려보내 더블 패딩 차단.
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
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});

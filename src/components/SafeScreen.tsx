import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

// 비-map 화면용 safe area wrapper. 루트 _layout 에서 SafeAreaView 가 빠진 후, 비-map 화면
// (forms / profile / auth / navigate 등) 이 status bar 밑에 깔리지 않도록 각자 두름.
// TripStatusBanner 가 보이는 상태에선 root 가 inset.top=0 을 provider 로 내려보내 더블 패딩 차단.
//
// edges 기본값에 'bottom' 포함 — 탭바가 없는 화면(auth login/signup 등)에서 하단 콘텐츠가
// 제스처 네비게이션 바 밑으로 잘리던 회로 차단. 탭바가 하단 inset 을 이미 소비하는 탭 화면은
// edges={['top']} 으로 호출해 더블 패딩을 피한다.
export function SafeScreen({
  children,
  edges = ['top', 'bottom'],
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

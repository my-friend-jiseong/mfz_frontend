import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

// 비-map 화면용 safe area wrapper. 루트 _layout 에서 SafeAreaView 가 빠진 후, 비-map 화면
// (forms / profile / auth / navigate 등) 이 status bar 밑에 깔리지 않도록 각자 두름.
// TripStatusBanner 가 보이는 상태에선 root 가 inset.top=0 을 provider 로 내려보내 더블 패딩 차단.
export function SafeScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});

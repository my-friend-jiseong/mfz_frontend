import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { safeBack } from '@/utils/backNavigation';
import { c2, space } from '@/theme/v2';

/**
 * 8-7 사진으로 여러 곳 등록 — 8-6 기록 메뉴에서 연다. X 로 닫는 모달.
 * TODO(PR9): 사진 고르기 → 위치별 묶음(100m) → 기존 현장엔 사진 추가·나머지는 새 현장, 8-8 사진 위치 지정, 8-14.
 */
export default function PhotoBatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4] }]}>
      <View style={styles.head}>
        <MapButton icon="close" size={44} accessibilityLabel="닫기" onPress={() => safeBack(router)} />
        <Text v2="heading" accessibilityRole="header">
          사진으로 여러 곳 등록
        </Text>
      </View>
      <View style={styles.body}>
        <Text v2="bodyM.regular" tone="tertiary" style={styles.center}>
          곧 쓸 수 있어요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[8], paddingHorizontal: space[8] },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[20] },
  center: { textAlign: 'center' },
});

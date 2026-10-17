import { useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { StyleSheet, View } from 'react-native';
import { SheetHandle } from '@/components/ui/AppSheet';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import TripsListScreen, { SHEET_COLLAPSED } from '@/screens/TripsListScreen';
import ActiveTrip from '@/screens/ActiveTripScreen';

// 외근 탭 첫 화면 — 진행 중 외근이 있으면 7 외근 진행, 없으면 1 지도(외근 내역).
// 예전엔 목록이 <Redirect> 로 active 를 replace 해 한 번 그려졌다 넘어갔다. 여기서 바로 갈라
// 깜빡임 없이 그리고, 탭을 다시 눌러 index 로 돌아와도 같은 규칙을 따른다.
export default function TripsTabRoot() {
  // 종료 직후(endingTripId)에도 외근 진행을 유지 — 상세로 이동이 끝난 뒤 목록으로 바뀐다(tripStore 주석).
  const showActive = useTripStore((s) => s.activeTripId !== null || s.endingTripId !== null);
  const resolved = useTripStore((s) => s.activeResolved);
  useDropInheritedParams();
  // 진행 중 여부를 받기 전에 목록을 그리면 곧 외근 진행으로 바뀌며 깜빡인다 — 그 사이엔 자리만 잡는다.
  if (!resolved && !showActive) return <TripsRootSkeleton />;
  return showActive ? <ActiveTrip /> : <TripsListScreen />;
}

// 1 지도·7 외근 진행 어느 쪽이든 '지도 + 아래 시트' 모양이라 그 윤곽만 잡는다 — 목록 카드 자리표시는
// 곧 지도로 바뀌며 화면 전체가 갈아 끼워지는 것처럼 보였다.
function TripsRootSkeleton() {
  return (
    <View style={styles.skeleton} accessible accessibilityRole="progressbar" accessibilityLabel="불러오는 중">
      <View style={styles.sheet}>
        <SheetHandle />
        <View style={[styles.bar, styles.barTitle]} />
        <View style={[styles.bar, styles.barLine]} />
        <View style={[styles.bar, styles.barShort]} />
      </View>
    </View>
  );
}

// 딥 링크(/trips/fields/123)로 들어오면 unstable_settings 가 밑에 깐 index 가 그 화면의 params(id)를
// 물려받아, 탭 다시 누르기로 돌아왔을 때 주소가 /trips?id=123 이 된다. 첫 화면은 params 를 쓰지 않으니 비운다.
function useDropInheritedParams() {
  const router = useRouter();
  const keys = Object.keys(useLocalSearchParams());
  const sig = keys.join();
  // 포커스일 때만 — router.setParams 는 지금 보이는 화면에 적용되므로 위에 쌓인 화면의 params 를 건드리지 않는다.
  useFocusEffect(
    useCallback(() => {
      if (!sig) return;
      router.setParams(Object.fromEntries(sig.split(',').map((k) => [k, undefined])));
    }, [router, sig]),
  );
}

const styles = StyleSheet.create({
  skeleton: { flex: 1, backgroundColor: c2.bg.muted },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_COLLAPSED,
    gap: space[12],
    paddingHorizontal: space[20],
    borderTopLeftRadius: radius2['2xl'],
    borderTopRightRadius: radius2['2xl'],
    backgroundColor: c2.bg.canvas,
    ...elevation2.sheet,
  },
  bar: { height: 14, borderRadius: radius2.xs, backgroundColor: c2.bg.muted },
  barTitle: { height: 20, width: '40%', marginTop: space[8] },
  barLine: { width: '84%' },
  barShort: { width: '56%' },
});

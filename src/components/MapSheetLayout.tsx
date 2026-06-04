import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { MapDashboard } from './MapDashboard';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// 시트 안 스크롤러블(BottomSheetFlatList/ScrollView)은 형제 View(고정 검색·칩 헤더)가
// 있을 때 뷰포트가 잔여 공간으로 고정되도록 flex:1 을 명시한다 (gorhom v5 #2347 예방).
// 주의: "목록 끝까지 스크롤 안 됨" 기기 버그(2026-06-05)의 실제 원인은 레이아웃이 아니라
// fieldStore 의 listMine 1페이지 절단이었다 (fields.listMineAll 참고). 이 스타일은
// 방어적 하이진으로 유지.
export const sheetScrollableStyle = { flex: 1 } as const;

interface Props {
  title: string;
  onBack?: () => void;
  initialIndex?: number; // 마운트/포커스 시 이 index로 reset. 미지정 시 2(최대)
  // 지도 배경에 노출할 현장 화이트리스트. 외근 상세/진행 중 화면에서
  // 해당 외근의 destinations.fieldId 만 넘기면 다른 현장이 흐려지지 않음.
  mapFieldIds?: string[];
  children: ReactNode;
}

/**
 * 지도 배경 + 하단 시트 레이아웃.
 *
 * 탭/스택 진입(focus) 마다 sheet 를 `initialIndex` 로 reset.
 * 이유: tab 루트의 StickyBottomBar 안에 있는 주요 CTA(외근 시작 등)는
 * sheet 가 내려가면 화면 밖으로 사라지므로, 탭 재진입 시 항상 보여야 함.
 * 사용자가 지도 보려면 시트를 직접 드래그 → 다음 focus 시 다시 펼침.
 */
export function MapSheetLayout({
  title,
  onBack,
  initialIndex = 2,
  mapFieldIds,
  children,
}: Props) {
  // 마지막 snap = 100% — 탭 진입 시 (initialIndex=2 default) 시트가 화면을 꽉 채움.
  // 이전 92% 는 status bar 위쪽이 살짝 비어 보이던 회로. middle/bottom snap 은 그대로.
  // 최소 snap(peek) 분율 — 지도 범례를 이 위로 띄우는 데도 재사용(아래 legendBottomInset).
  const MIN_SNAP_FRACTION = 0.18;
  const snapPoints = useMemo(
    () => [`${MIN_SNAP_FRACTION * 100}%`, '55%', '100%'],
    [],
  );
  const { height: screenHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheet>(null);
  // gorhom 의 '100%' 는 컨테이너 기준이라 상단 safe area (status bar/노치) 위로는 안 올라감.
  // 루트 SafeAreaView 제거 (app/_layout.tsx) 후 부모 컨테이너가 edge-to-edge 라 sheet 가
  // 자연스럽게 status bar 영역까지 닿음. inset 은 sheet 헤더의 paddingTop 보정에만 사용.
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      // mount race 차단 — sheetRef 가 ready 되기 전에 snapToIndex 가 호출되면
      // 시트가 초기 index 에 머물러 흰 화면이 됨. 한 프레임 미뤄 ref 부착 후 호출.
      const handle = requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex(initialIndex);
      });
      return () => cancelAnimationFrame(handle);
    }, [initialIndex]),
  );

  return (
    <View style={styles.root}>
      <MapDashboard
        scopeFieldIds={mapFieldIds}
        legendBottomInset={screenHeight * MIN_SNAP_FRACTION}
      />
      <BottomSheet
        ref={sheetRef}
        index={initialIndex}
        snapPoints={snapPoints}
        // v5 는 enableDynamicSizing 기본값이 true (v4→v5 브레이킹) — 켜져 있으면
        // 스크롤러블의 컨텐츠 측정 높이로 4번째 detent 를 몰래 끼워넣고 배열을 재정렬해
        // snapToIndex(0|1|2) 인덱스 가정이 깨진다 (useAnimatedDetents). 고정 snapPoints
        // 를 쓰는 시트는 반드시 false. (주의: "목록 끝까지 스크롤 안 됨" 기기 버그의
        // 원인으로 처음 지목했으나 실제 원인은 listMine 1페이지 절단 — fields.listMineAll.)
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        {/* sheet 가 100% snap 일 때 헤더가 status bar 뒤로 안 깔리도록 inset 만큼 추가 패딩 */}
        <View style={[styles.sheetHeader, { paddingTop: insets.top + spacing.sm }]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="뒤로 가기"
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <Text variant="h3">{title}</Text>
        </View>
        <View style={styles.content}>{children}</View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  sheetBg: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    backgroundColor: colors.border,
    width: 40,
    height: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    // paddingTop 은 inline 으로 inset 반영 — 100% snap 시 status bar 보호.
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: {
    padding: 2,
  },
  pressed: { opacity: 0.6 },
  content: { flex: 1 },
});

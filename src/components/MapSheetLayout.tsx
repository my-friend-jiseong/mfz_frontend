import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { MapDashboard } from './MapDashboard';
import { useUiStore } from '@/stores/uiStore';
import { colors } from '@/theme/colors';
import { spacing, fontSize } from '@/theme/spacing';

interface Props {
  title: string;
  onBack?: () => void;
  initialIndex?: number; // 주면 마운트 시 이 index로 고정 시작. 미지정 시 탭 간 공유 인덱스 사용
  // 지도 배경에 노출할 현장 화이트리스트. 외근 상세/진행 중 화면에서
  // 해당 외근의 destinations.fieldId 만 넘기면 다른 현장이 흐려지지 않음.
  mapFieldIds?: string[];
  children: ReactNode;
}

/**
 * 지도 배경 + 하단 시트 레이아웃.
 * `initialIndex`를 생략하면 탭 루트들끼리 `uiStore.sheetIndex`를 공유해
 * 사용자가 마지막에 드래그한 높이가 다음 탭에서도 유지된다.
 */
export function MapSheetLayout({
  title,
  onBack,
  initialIndex,
  mapFieldIds,
  children,
}: Props) {
  const snapPoints = useMemo(() => ['18%', '55%', '92%'], []);
  const shouldSync = initialIndex === undefined;
  const startIndex = initialIndex ?? useUiStore.getState().sheetIndex;
  const sheetRef = useRef<BottomSheet>(null);

  const handleChange = useCallback(
    (i: number) => {
      if (!shouldSync) return;
      if (i < 0) return; // closed/transient 값 무시
      useUiStore.getState().setSheetIndex(i);
    },
    [shouldSync],
  );

  useFocusEffect(
    useCallback(() => {
      if (!shouldSync) return;
      const target = useUiStore.getState().sheetIndex;
      // mount race 차단 — sheetRef 가 ready 되기 전에 snapToIndex 가 호출되면
      // 시트가 startIndex(18%) 에 머물러 흰 화면이 됨. 한 프레임 미뤄 ref 부착 후 호출.
      const handle = requestAnimationFrame(() => {
        sheetRef.current?.snapToIndex(target);
      });
      return () => cancelAnimationFrame(handle);
    }, [shouldSync]),
  );

  return (
    <View style={styles.root}>
      <MapDashboard scopeFieldIds={mapFieldIds} />
      <BottomSheet
        ref={sheetRef}
        index={startIndex}
        snapPoints={snapPoints}
        enablePanDownToClose={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
        onChange={handleChange}
      >
        <View style={styles.sheetHeader}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: {
    padding: 2,
  },
  pressed: { opacity: 0.6 },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  content: { flex: 1 },
});

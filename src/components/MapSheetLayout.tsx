import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
// 주의: flex:1 은 부모 높이가 유한할 때만 의미가 있다 — 아래 SHEET_HANDLE_HEIGHT 주석의
// 명시적 height 래퍼가 전제. (기기 "목록 끝까지 스크롤 안 됨" 버그의 진짜 원인 참고)
export const sheetScrollableStyle = { flex: 1 } as const;

// gorhom 기본 핸들 실높이 — indicator 4 + 상하 padding 10×2 (bottomSheetHandle/styles.ts).
// 시트 콘텐츠 영역 = 컨테이너 높이 - 핸들. 기본 핸들을 교체하면 이 값도 갱신할 것.
const SHEET_HANDLE_HEIGHT = 24;

interface Props {
  title: string;
  onBack?: () => void;
  initialIndex?: number; // 마운트/포커스 시 이 index로 reset. 미지정 시 2(최대)
  // 지도 배경에 노출할 현장 화이트리스트. 외근 상세/진행 중 화면에서
  // 해당 외근의 destinations.fieldId 만 넘기면 다른 현장이 흐려지지 않음.
  mapFieldIds?: string[];
  // 현장 선택 모드(외근 시작) — 배경 지도 마커를 탭해 선택 토글. 리스트와 동기화.
  selectedFieldIds?: string[];
  onSelectField?: (fieldId: string) => void;
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
  selectedFieldIds,
  onSelectField,
  children,
}: Props) {
  // 마지막 snap = 100% — 탭 진입 시 (initialIndex=2 default) 시트가 화면을 꽉 채움.
  // 이전 92% 는 status bar 위쪽이 살짝 비어 보이던 회로. middle/bottom snap 은 그대로.
  // 최소 snap(peek) 분율 — 지도 범례를 이 위로 띄우는 데도 재사용(아래 legendBottomInset).
  // 0.18 → 0.13: peek 가 너무 많이 튀어나와 지도가 좁아 보이던 것을 줄여 핸들+제목만 살짝 남김
  // (헤더의 죽은 top inset 도 함께 트림 — 아래 sheetHeader paddingTop 참고).
  const MIN_SNAP_FRACTION = 0.13;
  const snapPoints = useMemo(
    () => [`${MIN_SNAP_FRACTION * 100}%`, '55%', '100%'],
    [],
  );
  const { height: screenHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheet>(null);

  // ── 기기 "목록 끝까지 스크롤 안 됨" 버그의 진짜 원인 수정 (2026-06-05, 4번째 조치) ──
  // gorhom v5 는 시트 콘텐츠 래퍼 높이를 useAnimatedStyle 로 주입하는데
  // (BottomSheetContent.tsx contentMaskContainerAnimatedStyle), 이 worklet 은 컨테이너
  // 측정 전 `{}` → 측정 후 `{height,...}` 로 반환 키가 달라진다. Fabric(RN 0.81) +
  // reanimated 4 에선 나중에 추가된 height 키가 네이티브에 적용되지 않아 래퍼가
  // auto 높이로 자식 크기만큼 자라고(기기 실측: 화면 773dp 에 래퍼 3763dp), 리스트
  // 뷰포트 하단이 화면 밖에 렌더되어 마지막 항목들이 도달 불가가 된다. 웹 reanimated
  // 는 DOM 스타일이라 정상 → 웹 미재현. 데이터(listMineAll)·flex:1·dynamicSizing 은
  // 전부 무관했다 (1~3차 조치 오진).
  // 해결: gorhom 의 깨진 height 에 기대지 않고, 컨테이너 실측 높이 - 핸들 높이를
  // children 래퍼에 명시. gorhom 이 정상일 때 계산하는 값과 동일하므로 (sheetHeight
  // = 최대 detent '100%' = containerHeight) 웹/수정된 future 버전에서도 무해.
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const onRootLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) =>
      setContainerHeight(e.nativeEvent.layout.height),
    [],
  );
  // ──────────────────────────────────────────────────────────────────────────
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
    <View style={styles.root} onLayout={onRootLayout}>
      <MapDashboard
        scopeFieldIds={mapFieldIds}
        legendBottomInset={screenHeight * MIN_SNAP_FRACTION}
        selectedFieldIds={selectedFieldIds}
        onSelectField={onSelectField}
      />
      <BottomSheet
        ref={sheetRef}
        index={initialIndex}
        snapPoints={snapPoints}
        // v5 는 enableDynamicSizing 기본값이 true (v4→v5 브레이킹) — 켜져 있으면
        // 스크롤러블의 컨텐츠 측정 높이로 4번째 detent 를 몰래 끼워넣고 배열을 재정렬해
        // snapToIndex(0|1|2) 인덱스 가정이 깨진다 (useAnimatedDetents). 고정 snapPoints
        // 를 쓰는 시트는 반드시 false. (주의: "목록 끝까지 스크롤 안 됨" 기기 버그의
        // 원인으로 처음 지목했으나 오진 — 실제 원인은 위 명시적 height 주석 참고.)
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        {/* 명시적 height — gorhom 콘텐츠 래퍼 높이 미적용(Fabric+reanimated 4) 우회.
            측정 전 한 프레임은 화면 높이로 근사 후 실측값으로 보정. */}
        <View
          style={{ height: (containerHeight ?? screenHeight) - SHEET_HANDLE_HEIGHT }}
        >
          {/* sheet 가 100% snap 일 때 헤더가 status bar 뒤로 안 깔리도록 보정.
              핸들(SHEET_HANDLE_HEIGHT)이 이미 status bar 안쪽으로 들어가 있으므로 그만큼 빼
              죽은 여백을 줄인다 — peek 일 때 헤더가 덜 튀어나오고, 100% 에선 여전히 상태바 보호. */}
          <View
            style={[
              styles.sheetHeader,
              {
                paddingTop: Math.max(
                  spacing.sm,
                  insets.top - SHEET_HANDLE_HEIGHT + spacing.sm,
                ),
              },
            ]}
          >
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
        </View>
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

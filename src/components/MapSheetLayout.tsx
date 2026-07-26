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

// 최하단 peek = 핸들 바만 보이는 얇은 띠(거의 다 내려간 상태). 이전엔 13%/18% 가 늘 바닥을
// 차지해 답답했음 — 핸들 높이+약간 여유로 축소해 지도/콘텐츠가 넓어 보이고, 그래도 띠를
// 잡아 다시 끌어올릴 수 있다(완전히 닫지 않는 이유).
const PEEK_HEIGHT = SHEET_HANDLE_HEIGHT + spacing.sm; // 32

// 시트를 끝까지 올렸을 때 상단에 남길 여백 = safe area(상태바/노치) + 추가 여백.
// safe area 만으로는(=insets.top) 시트가 상태바 바로 밑에 붙어 상단 카메라·지도가 답답해
// 보였음(실기기 확인). 추가값 56 = Material 상단 앱바 1개 높이 — 지도 앱(구글/애플)이
// 확장 시 남기는 "툴바 한 줄" 노출 관용치. 기기별 목업 렌더로 40/56/72 비교해 56 채택.
const SHEET_TOP_GAP_EXTRA = 56;

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
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);

  // 최대 snap = 화면 높이 − (상단 safe area + 추가 여백). 끝까지 올려도 상단에 지도(카메라)
  // 영역을 남겨 지도를 완전히 덮지 않는다(사용자 요청). 이전 '100%' 는 컨테이너를 꽉 채워
  // 지도가 안 보였고, safe area 만(=insets.top) 남기면 상태바 바로 밑에 붙어 답답했음.
  // 분율(%) 대신 px — safe area 는 화면 크기와 무관한 고정 px 라서. middle 55%·PEEK 은 그대로.
  const topGap = insets.top + SHEET_TOP_GAP_EXTRA;
  const snapPoints = useMemo(
    () => [PEEK_HEIGHT, '55%', screenHeight - topGap],
    [screenHeight, topGap],
  );

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
        legendBottomInset={PEEK_HEIGHT}
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
            시트 최대 높이(screenHeight − topGap)에서 핸들을 뺀 값 = 최대 snap 시 콘텐츠 영역.
            topGap 을 빼지 않으면 리스트가 시트 하단 밖으로 넘쳐 마지막 항목이 안 잡힘. */}
        <View
          style={{
            height: (containerHeight ?? screenHeight) - topGap - SHEET_HANDLE_HEIGHT,
          }}
        >
          {/* 시트 상단이 이제 status bar 아래(insets.top)에서 시작 → 헤더에 status bar 보정
              불필요, 일반 여백만. */}
          <View style={styles.sheetHeader}>
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
  content: { flex: 1 },
});

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
// 추가 여백은 지도 위에 떠 있는 검색창(MapSearchBar) 바로 아래에 시트 상단을 맞추기 위한 값.
// MapSearchBar 는 anchor 를 insets.top + spacing.sm 위치에 height 44 로 띄운다
// (MapSearchBar styles.anchor / MapDashboard placeCard top 계산과 동일 근거). 따라서 검색창
// 하단 = spacing.sm + 44. 거기에 spacing.sm 만큼 더 내려 검색창을 온전히 남기고 시트가
// 검색창을 덮거나 어중간하게 걸치지 않게 한다(사용자 요청: "검색창 하단 약간 아래에 맞춰").
const MAP_SEARCHBAR_HEIGHT = 44; // MapSearchBar styles.anchor.height 와 일치시킬 것
const SHEET_TOP_GAP_EXTRA = spacing.sm + MAP_SEARCHBAR_HEIGHT + spacing.sm; // 60

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
  // 외근 방문 순서(fieldId 배열) — 마커 순번 + 점선 경로. 순서 화면/진행 중/정리 화면에서 사용.
  routeFieldIds?: string[];
  // true 면 mapFieldIds(지도 스코프)가 바뀔 때 시트를 내려 지도를 드러낸다.
  // 목록에서 특정 외근을 '지도에서 보기' 했을 때 시트가 지도를 덮고 있으면 아무 일도 안 일어난 것처럼 보인다.
  collapseOnScopeChange?: boolean;
  // 스코프가 걸려도 지도 검색창·레이어 패널·표시 설정을 유지(메인 탭 안의 임시 포커스용).
  keepGlobalChrome?: boolean;
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
  routeFieldIds,
  collapseOnScopeChange = false,
  keepGlobalChrome = false,
  children,
}: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);

  // 시트 컨테이너(= 지도 배경 root View) 실측 높이. onRootLayout 로 채워진다.
  // ★ 중요: 이 컨테이너는 window 전체가 아니라 "하단 탭바 위" 영역이라 screenHeight 보다 작다.
  //   최대 snap·콘텐츠 높이는 반드시 이 값을 기준으로 계산해야 한다(아래 topGap 주석 참고).
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const onRootLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) =>
      setContainerHeight(e.nativeEvent.layout.height),
    [],
  );

  // 최대 snap = 컨테이너 높이 − (상단 safe area + 추가 여백). 끝까지 올려도 상단에 지도·검색창을
  // 남겨 지도를 완전히 덮지 않는다(사용자 요청).
  // ★ 이전 버그(웹 실측으로 확인): screenHeight − topGap 을 썼음. 하지만 gorhom 의 숫자 snap 은
  //   "컨테이너 하단 기준 시트 높이"이고, 컨테이너는 탭바 위 영역이라 window 보다 ~탭바만큼 짧다.
  //   window 높이에서 빼면 시트가 컨테이너보다 커져 상단 여백이 topGap 만큼 안 남고 ~12px 로 줄어
  //   지도 검색창을 절반쯤 덮었다. 컨테이너 높이 기준으로 빼면 상단 offset = topGap 으로 정확히 남음.
  //   콘텐츠 래퍼 높이(아래)도 동일하게 containerHeight 기준 → 둘이 일치해야 목록 잘림도 없음.
  // 분율(%) 대신 px — safe area·검색창 높이는 화면 크기와 무관한 고정 px. middle 55%·PEEK 은 그대로.
  const topGap = insets.top + SHEET_TOP_GAP_EXTRA;
  // ★ 0 높이 방어 (웹 실측: 시트 화면 → 시트 없는 화면(체크인) 전환 시 크래시).
  //   전환 중 이 컨테이너의 onLayout 이 height 0 으로 한 번 보고되는데, ?? 폴백은 null 만 막아
  //   0 이 그대로 통과했다. 그러면 max snap = 0 - 60 = -60 이 되고 gorhom 이
  //   "Snap point '-60' is invalid" invariant 로 앱을 죽인다.
  //   측정값이 쓸모없을 땐 screenHeight 로 되돌리고, 그래도 음수면 PEEK 위로 clamp 해
  //   snapPoints 가 항상 오름차순 양수가 되도록 한다.
  //
  // ★ 더 중요한 이유 — snapPoints 를 마운트 후에 바꾸지 않기 위해서다(실측):
  //   onLayout 은 0 → 실제높이 순으로 두 번 오고, 그때마다 maxSheetHeight 가 바뀌면
  //   (예: 579 → 523) snapPoints 배열이 교체된다. gorhom 은 배열이 바뀌면 현재 위치를
  //   새 배열에 다시 맞추는데, 이때 시트가 peek 으로 떨어지고 focus 의 snapToIndex 로도
  //   복구되지 않았다(목록→상세→뒤로 5/5 재현, 현장 탭도 동일).
  //   그래서 측정 전에는 시트를 아예 렌더하지 않는다 — 아래 measuredHeight != null 가드.
  //   덕분에 BottomSheet 는 첫 렌더부터 확정된 snapPoints 를 갖고, 이후 바뀌는 경우는
  //   진짜 창 크기 변경뿐이다(그때는 재조정이 맞는 동작).
  const measuredHeight =
    containerHeight != null && containerHeight > 0 ? containerHeight : null;
  const maxSheetHeight = Math.max(
    PEEK_HEIGHT + 1,
    (measuredHeight ?? screenHeight) - topGap,
  );
  const snapPoints = useMemo(
    () => [PEEK_HEIGHT, '55%', maxSheetHeight],
    [maxSheetHeight],
  );

  // 지도 스코프 전환 → 시트 내림(55%). 해제되면 다시 initialIndex 로 복귀.
  // useFocusEffect 의 initialIndex reset 과 달리 '포커스'가 아니라 '스코프 변화'에만 반응하므로
  // 탭 재진입 시의 reset 과 서로 밟지 않는다. 첫 렌더(prev === null)는 건너뛴다 — 마운트 시엔
  // useFocusEffect 가 이미 initialIndex 로 맞춰 놓기 때문.
  const scopeKey = mapFieldIds ? mapFieldIds.join(',') : '';
  const prevScopeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!collapseOnScopeChange) return;
    const prev = prevScopeKeyRef.current;
    prevScopeKeyRef.current = scopeKey;
    if (prev === null || prev === scopeKey) return;
    sheetRef.current?.snapToIndex(scopeKey ? 1 : initialIndex);
  }, [collapseOnScopeChange, scopeKey, initialIndex]);

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
        routeFieldIds={routeFieldIds}
        keepGlobalChrome={keepGlobalChrome}
      />
      {/* 컨테이너 높이가 측정되기 전엔 시트를 렌더하지 않는다 — snapPoints 를 마운트 후에
          바꾸지 않기 위해서(위 measuredHeight 주석 참고). 지도는 그대로 깔려 있으므로
          사용자에겐 시트가 한 프레임 늦게 올라오는 것으로만 보인다. */}
      {measuredHeight == null ? null : (
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
            최대 snap(maxSheetHeight)에서 핸들을 뺀 값 = 최대 detent 시 콘텐츠 영역. snapPoints 의
            max 와 동일 기준(containerHeight)이라 항상 일치 → 리스트가 시트 밖으로 넘쳐 마지막
            항목이 안 잡히던 문제 없음.
            ── 왜 명시적 height 인가 (기기 "목록 끝까지 스크롤 안 됨" 4번째 조치, 2026-06-05) ──
            gorhom v5 는 콘텐츠 래퍼 높이를 useAnimatedStyle 로 주입하는데(BottomSheetContent
            contentMaskContainerAnimatedStyle), 이 worklet 은 측정 전 `{}` → 측정 후 `{height,...}`
            로 반환 키가 달라진다. Fabric(RN 0.81)+reanimated 4 에선 나중에 추가된 height 키가
            네이티브에 적용 안 돼 래퍼가 auto 로 자식만큼 자라고(실측: 화면 773dp 에 래퍼 3763dp)
            리스트 하단이 화면 밖에 렌더돼 마지막 항목 도달 불가. 웹은 DOM 스타일이라 정상(미재현).
            데이터·flex:1·dynamicSizing 은 전부 무관했다(1~3차 오진). */}
        <View style={{ height: maxSheetHeight - SHEET_HANDLE_HEIGHT }}>
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
      )}
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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useRealSafeAreaInsets } from '@/components/shell/realInsets';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Easing } from 'react-native-reanimated';
import { duration, rEasing } from '@/theme/motion';
import { Icon } from '@/components/icons';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { Text } from './Text';
import { Touchable } from './Touchable';

/** 바텀 시트 맨 위 손잡이 36×4(Figma SheetHandle 534:1256). 시트 아닌 곳(지도 화면 고정 시트)에서도 쓴다. */
export function SheetHandle({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.handleArea, style]}>
      <View style={styles.handle} />
    </View>
  );
}

/**
 * 화면에 붙박인 시트(1·4·6 지도 화면의 BottomSheet)가 화면이 뜰 때 아래에서 따로 올라오지 않게 하는 animationConfigs.
 * gorhom 5.2 는 animateOnMount={false} 여도 레이아웃이 잡히는 순간 첫 자리로 '움직여' 간다(isAnimatedOnMount 가 처음부터
 * true 라 마운트 분기를 건너뛴다, 웹 실측 0.5초). 그래서 시트가 마운트된 뒤(sheetMounted) 잠깐은 시간 0 으로 두고, 그 뒤 기본으로
 * 돌린다. 반환값을 animationConfigs 에 넘기고 animateOnMount={false} 와 함께 쓴다.
 * 그 잠깐 사이에도 사용자가 누른 스냅은 움직여야 하므로, 코드로 하는 snapToIndex 에는 SHEET_SNAP 을 직접 넘긴다.
 */
export function useSheetMountConfigs(sheetMounted: boolean): { duration: number } | undefined {
  const [cfg, setCfg] = useState<{ duration: number } | undefined>(INSTANT);
  useEffect(() => {
    if (!sheetMounted) return;
    const t = setTimeout(() => setCfg(undefined), SETTLE_MS);
    return () => clearTimeout(t);
  }, [sheetMounted]);
  return cfg;
}
const INSTANT = { duration: 0 };
// 컨테이너 높이 측정 → 첫 자리 잡기까지 넉넉히.
const SETTLE_MS = 600;

/** gorhom 기본 스냅 애니메이션(안드로이드 timing 250·exp out, 그 밖 스프링)과 같은 값 — 코드로 스냅할 때 넘긴다. */
export const SHEET_SNAP =
  Platform.OS === 'android'
    ? { duration: 250, easing: Easing.out(Easing.exp) }
    : { damping: 500, stiffness: 1000, mass: 3, overshootClamping: true, restDisplacementThreshold: 10, restSpeedThreshold: 10 };

// gorhom handleComponent 는 시트 상태 props 를 넘긴다 — 모양만 쓰므로 무시한다.
const SheetHandleSlot = () => <SheetHandle />;

interface Props {
  open: boolean;
  /** 스크림·아래로 끌기·X·안드로이드 뒤로 — 어떤 경로로 닫혀도 한 번 부른다. */
  onClose: () => void;
  title?: string;
  /** 제목 아래 한 줄(5-6 '낙동대로 355 · 여러 개 고를 수 있어요'). */
  subtitle?: string;
  /** 오른쪽 위 X. 기본 true(제목이 있을 때). */
  closeButton?: boolean;
  /** 내용이 길면 true — 시트 안에서 스크롤한다(최대 화면 85%). */
  scrollable?: boolean;
  /**
   * 고정 높이 시트가 필요하면 넘긴다(예: ['50%']). 없으면 내용 높이에 맞춘다(dynamic sizing).
   * ★ dynamic sizing 은 gorhom 5.2.10 회귀(#2710): 여는 애니메이션 도중 내용이 자라면 높이가 갱신되지
   *   않는다. 그래서 내용은 open 전에 준비해 두고(비동기 로딩 뒤에 open), 열린 뒤 크게 바뀌는 시트는
   *   snapPoints 를 넘긴다. 열린 뒤의 크기 변화는 정상 반영된다(애니메이션이 끝난 뒤라서).
   */
  snapPoints?: (string | number)[];
  /** 위 모서리. 기본 20(5-6·1-2), 1-3 지도 설정은 24. */
  topRadius?: number;
  /** scrollable 시트에서 이 값이 바뀌면 맨 아래로 스크롤한다(5-12 새 분류 입력 줄·오류가 보이게). */
  scrollToEndKey?: string | number | null;
  children: React.ReactNode;
}

/**
 * 2차 바텀 시트(gorhom BottomSheetModal 래퍼). 프레임 5-3·5-6·1-2·1-3 모양:
 * 위 모서리 20, 손잡이 36×4, 제목 Title/S + X(44), 스크림 0.45.
 * 루트의 BottomSheetModalProvider(app/_layout.tsx) 아래에서만 동작한다.
 */
export function AppSheet({
  open,
  onClose,
  title,
  subtitle,
  closeButton = !!title,
  scrollable,
  snapPoints,
  children,
  topRadius,
  scrollToEndKey,
}: Props) {
  const ref = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  useEffect(() => {
    if (scrollToEndKey == null) return;
    // 새 줄이 그려진 뒤에.
    const h = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(h);
  }, [scrollToEndKey]);
  // 시트는 포털로 창 맨 아래까지 내려온다 — 탭 화면의 bottom 0 덮어쓰기 대신 창 기준 inset.
  const insets = useRealSafeAreaInsets();
  const { height } = useWindowDimensions();
  // presented: 시트가 떠 있거나 뜨는 중. dismissing: open=false 로 우리가 닫기를 요청해 내려가는 중.
  // 닫히는 애니메이션 도중 다시 open=true 가 오면(닫자마자 다시 열기) present 가 무시되므로,
  // onDismiss 에서 최신 open 을 보고 다시 띄운다.
  const presented = useRef(false);
  const dismissing = useRef(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      if (!presented.current) {
        presented.current = true;
        ref.current?.present();
      }
      // dismissing 중이면 onDismiss 가 다시 띄운다.
    } else if (presented.current && !dismissing.current) {
      dismissing.current = true;
      ref.current?.dismiss();
    }
  }, [open]);

  // 안드로이드 뒤로: gorhom BottomSheetModal 은 뒤로 버튼을 받지 않아 시트가 열린 채 화면 뒤로·앱 밖으로 나간다
  // (실기기 확인 2026-10-18). 열려 있는 동안 가로채 시트만 닫는다. 나중에 등록한 것이 먼저 불려 위 시트부터 닫힌다.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const handleDismiss = useCallback(() => {
    if (!presented.current) return;
    const requested = dismissing.current;
    presented.current = false;
    dismissing.current = false;
    if (requested && openRef.current) {
      presented.current = true;
      ref.current?.present();
      return;
    }
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} pressBehavior="close" style={[props.style, styles.backdrop]} />
    ),
    [],
  );

  const header =
    title || closeButton ? (
      <View>
        <View style={styles.titleRow}>
          {title ? (
            <Text v2="title.s" style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View style={styles.title} />
          )}
          {closeButton ? (
            <Touchable
              onPress={() => ref.current?.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              style={styles.close}
            >
              <Icon name="close" size={22} color={c2.text.primary} />
            </Touchable>
          ) : null}
        </View>
        {subtitle ? (
          <Text v2="bodyS.regular" tone="tertiary" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    ) : null;

  const bottomPad = { paddingBottom: insets.bottom + space[16] };
  // 안드로이드 gorhom 기본(250ms·exp out)을 토큰(slow·emphasized)으로 맞춘다. iOS·웹은 gorhom 기본 스프링을
  // 그대로 둔다 — 끌다 놓을 때 손가락 속도를 이어받는 게 시트의 자연스러운 감각이고, 시간이 정해진 timing 은
  // 빠르게 튕겨 닫을 때 오히려 굼뜨게 느껴진다(결정).
  const androidTiming = useBottomSheetTimingConfigs({ duration: duration.slow, easing: rEasing.emphasized });
  const animationConfigs = Platform.OS === 'android' ? androidTiming : undefined;

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      maxDynamicContentSize={height * 0.85}
      enablePanDownToClose
      animationConfigs={animationConfigs}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleComponent={SheetHandleSlot}
      backgroundStyle={topRadius != null ? [styles.bg, { borderTopLeftRadius: topRadius, borderTopRightRadius: topRadius }] : styles.bg}
      style={topRadius != null ? [styles.shadow, { borderTopLeftRadius: topRadius, borderTopRightRadius: topRadius }] : styles.shadow}
    >
      {scrollable ? (
        <BottomSheetScrollView ref={scrollRef as never} contentContainerStyle={bottomPad}>
          {header}
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={bottomPad}>
          {header}
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  // gorhom 기본 스크림은 검정 — 2차 bg/overlay 는 ink(#0f172a) 0.45.
  backdrop: { backgroundColor: c2.bg.ink },
  handleArea: { paddingTop: space[8], paddingBottom: space[8], alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c2.bg.strong },
  bg: {
    backgroundColor: c2.bg.canvas,
    borderTopLeftRadius: radius2['2xl'],
    borderTopRightRadius: radius2['2xl'],
  },
  shadow: { ...elevation2.sheet, borderTopLeftRadius: radius2['2xl'], borderTopRightRadius: radius2['2xl'] },
  titleRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: space[20], paddingRight: space[8] },
  title: { flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  subtitle: { paddingHorizontal: space[20], marginBottom: space[8] },
});

import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useBottomChromeStore } from '@/stores/bottomChromeStore';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

interface Props {
  /** 오른쪽 주 행동 — 남은 너비를 채운다. */
  children: React.ReactNode;
  /** 왼쪽 보조·삭제 행동 — 내용 너비. */
  secondary?: React.ReactNode;
  /**
   * 지도+시트 화면처럼 부모가 흐름 레이아웃이 아닐 때 화면 하단에 붙인다.
   * 시트 **밖**에 마운트해야 한다 — 시트 안에 두면 gorhom pan 이 터치를 가로챈다.
   */
  absolute?: boolean;
  /**
   * 홈 인디케이터만큼 아래 여백을 더할지. 탭 화면 안에서는 탭 레이아웃이 bottom inset 을 0 으로 내려
   * 주므로 따로 끌 필요 없이 Figma 대로 `padding: 12px 16px 12px`(탭 바 바로 위)가 된다.
   */
  safeArea?: boolean;
}

// 버튼 52 + 위 12 + 아래 최소 12. 스크롤 콘텐츠가 바 뒤로 숨지 않게 하단 여백 계산에 쓴다.
// 실제 높이는 홈 인디케이터만큼 더 크다 — 여백 계산에는 useBottomActionBarHeight() 를 쓴다.
export const BOTTOM_ACTION_BAR_HEIGHT = 52 + spacing.md * 2;

/** 이 기기에서 바의 실제 높이(버튼 + 위 여백 + max(safe area, 12)). */
export function useBottomActionBarHeight(safeArea = true): number {
  const insets = useSafeAreaInsets();
  return 52 + spacing.md + (safeArea ? Math.max(insets.bottom, spacing.md) : spacing.md);
}

/**
 * 하단 액션 바 (명세 v2 §1.2). 흰 배경 + 위쪽 1px 구분선 + 좌우 16.
 * 보조 버튼은 왼쪽(내용 너비), 주 버튼은 오른쪽(남은 너비).
 * 떠 있는 CTA(`StickyBottomBar`)와 달리 화면 바닥에 붙어 콘텐츠와 경계를 만든다.
 */
// 탭 화면에서 보이는 동안 높이를 셸에 알린다 — 스낵바가 이 바 위로 뜨게(bottomChromeStore).
// 탭 밖(모달·RN Modal 안)이면 아무것도 안 한다. 포커스를 잃으면(다른 탭·푸시 화면) 0 으로 돌린다.
function useReportFooterHeight(height: number) {
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const nav = useContext(NavigationContext);
  useEffect(() => {
    if (!inTabs || !nav || height === 0) return;
    const { setFooter } = useBottomChromeStore.getState();
    const apply = () => setFooter(height);
    const clear = () => setFooter(0);
    if (nav.isFocused()) apply();
    const offFocus = nav.addListener('focus', apply);
    const offBlur = nav.addListener('blur', clear);
    return () => {
      offFocus();
      offBlur();
      clear();
    };
  }, [inTabs, nav, height]);
}

export function BottomActionBar({ children, secondary, absolute, safeArea = true }: Props) {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  useReportFooterHeight(height);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height))}
      style={[
        styles.bar,
        { paddingBottom: safeArea ? Math.max(insets.bottom, spacing.md) : spacing.md },
        absolute && styles.absolute,
      ]}
    >
      {secondary ? <View style={styles.secondary}>{secondary}</View> : null}
      <View style={styles.primary}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  absolute: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  secondary: { flexShrink: 0 },
  primary: { flex: 1 },
});

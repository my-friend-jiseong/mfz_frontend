import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
}

// 버튼 52 + 위 12 + 아래 최소 12. 스크롤 콘텐츠가 바 뒤로 숨지 않게 하단 여백 계산에 쓴다.
// 실제 높이는 홈 인디케이터만큼 더 크다 — 여백 계산에는 useBottomActionBarHeight() 를 쓴다.
export const BOTTOM_ACTION_BAR_HEIGHT = 52 + spacing.md * 2;

/** 이 기기에서 바의 실제 높이(버튼 + 위 여백 + max(safe area, 12)). */
export function useBottomActionBarHeight(): number {
  const insets = useSafeAreaInsets();
  return 52 + spacing.md + Math.max(insets.bottom, spacing.md);
}

/**
 * 하단 액션 바 (명세 v2 §1.2). 흰 배경 + 위쪽 1px 구분선 + 좌우 16.
 * 보조 버튼은 왼쪽(내용 너비), 주 버튼은 오른쪽(남은 너비).
 * 떠 있는 CTA(`StickyBottomBar`)와 달리 화면 바닥에 붙어 콘텐츠와 경계를 만든다.
 */
export function BottomActionBar({ children, secondary, absolute }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, spacing.md) },
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

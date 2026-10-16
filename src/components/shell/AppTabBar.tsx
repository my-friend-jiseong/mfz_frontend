import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { c2, space } from '@/theme/v2';
import { registerTabsNavigation } from './tabNav';

// Figma TabBar 534:1228 · TabItem 534:1143. 칸 높이 64 + 아래 safe area(Figma 프레임은 20).
export const TAB_ITEM_HEIGHT = 64;
// 홈 인디케이터가 없는 기기·웹에서도 Figma 와 같은 84 를 유지하는 최소 아래 여백.
export const TAB_BAR_MIN_BOTTOM = space[20];

/** 이 기기에서 탭 바 전체 높이. insets.bottom 은 탭 레이아웃이 실측해 넘긴다. */
export function tabBarHeight(insetBottom: number): number {
  return TAB_ITEM_HEIGHT + Math.max(insetBottom, TAB_BAR_MIN_BOTTOM);
}

// 아이콘-라벨 간격. Figma TabItem 에 변수 없이 3 으로 박혀 있다.
const ICON_LABEL_GAP = 3;

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  trips: { label: '외근', icon: 'briefcase', iconActive: 'briefcase-filled' },
  reports: { label: '보고서', icon: 'document', iconActive: 'document-filled' },
  profile: { label: '내 정보', icon: 'user', iconActive: 'user-filled' },
};

interface Props extends BottomTabBarProps {
  /** 실제 기기의 아래 safe area. 탭 화면 쪽 inset 은 0 으로 덮어써 두었으므로 따로 받는다. */
  insetBottom: number;
}

/**
 * 하단 탭 바(외근·보고서·내 정보). React Navigation 기본 바 대신 직접 그려 Figma 칸 규격을 그대로 맞춘다.
 * 같은 탭을 다시 누르면 그 탭 첫 화면(index)으로 — popToTop 은 스택 쪽 리스너가, 스택이 index 로
 * 시작하지 않는 경우(외근 상세만 남은 스택 등)의 reset 은 탭 레이아웃의 tabPress 리스너가 한다.
 */
export function AppTabBar({ state, navigation, insetBottom }: Props) {
  useEffect(() => registerTabsNavigation(navigation), [navigation]);
  return (
    <View style={[styles.bar, { height: tabBarHeight(insetBottom), paddingBottom: Math.max(insetBottom, TAB_BAR_MIN_BOTTOM) }]}>
      {state.routes.map((route, i) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === i;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          // 이벤트를 막은 쪽(탭 레이아웃 리스너)이 이미 처리했다.
          if (event.defaultPrevented) return;
          if (!focused) {
            // 기본 BottomTabBar 와 같은 방식 — 그 탭 스택 상태를 그대로 둔 채 전환한다.
            navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
            return;
          }
          // 같은 탭 다시 누르기: popToTop 은 스택 쪽 tabPress 리스너가 한다. 맨 아래가 index 가 아닌 스택은
          // 탭 레이아웃의 tabPress 리스너가 기본 동작을 막고 reset 한다(app/(tabs)/_layout.tsx).
        };
        const tone = focused ? 'link' : 'tertiary';
        return (
          <Touchable
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            pressedOpacity={1}
            noAutoHitSlop
            style={styles.item}
          >
            <Icon name={focused ? meta.iconActive : meta.icon} size={24} color={c2.text[tone]} />
            <Text v2={focused ? 'small.bold' : 'small.regular'} tone={tone}>
              {meta.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: c2.bg.canvas,
    borderTopWidth: 1,
    borderTopColor: c2.border.default,
  },
  item: {
    flex: 1,
    height: TAB_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_LABEL_GAP,
  },
});

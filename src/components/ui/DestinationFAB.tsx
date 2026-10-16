import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, elevation2, radius2 } from '@/theme/v2';
import { fontFamily } from '@/theme/typography';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props {
  count: number;
  onPress: () => void;
  /** 60 기본(Figma DestinationFAB), 44 는 검색창 옆 작은 버튼(4 현장 검색 등). */
  size?: 60 | 44;
  style?: StyleProp<ViewStyle>;
}

/**
 * 담은 목적지 수를 배지로 보이는 버튼(Figma DestinationFAB 534:1232). 0이면 배지를 숨긴다.
 * 배지는 왼쪽 끝을 고정해 자릿수가 늘면 오른쪽으로 자란다.
 */
export function DestinationFAB({ count, onPress, size = 60, style }: Props) {
  const sm = size === 44;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`외근 목적지 ${count}곳`}
      style={[styles.fab, sm ? styles.fabSm : styles.fabLg, style]}
    >
      <Icon name="destinations" size={sm ? 22 : 28} color={c2.text.inverse} />
      {count > 0 ? (
        // 배지 자리: 왼쪽만 고정하면 남은 폭(60-40=20)에 맞춰 숫자가 줄바꿈된다(웹 실측 '12').
        // 오른쪽으로 넉넉한 투명 틀을 두고 그 안에서 왼쪽 정렬해 자릿수만큼 오른쪽으로 자라게 한다.
        <View pointerEvents="none" style={[styles.badgeSlot, { left: sm ? 30 : 40 }]}>
          <View style={sm ? styles.badgeSm : styles.badge}>
            <Text
              v2={sm ? 'small.bold' : 'bodyS.extrabold'}
              tone="brand"
              numeric
              numberOfLines={1}
              style={sm ? styles.countSm : null}
            >
              {count}
            </Text>
          </View>
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  fab: {
    backgroundColor: c2.bg.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation2.fab,
  },
  fabLg: { width: 60, height: 60, borderRadius: radius2['2xl'] },
  fabSm: { width: 44, height: 44, borderRadius: radius2.lg },
  badgeSlot: { position: 'absolute', top: -6, width: 64, alignItems: 'flex-start' },
  badge: {
    minWidth: 23,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    borderWidth: 2,
    borderColor: c2.border.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSm: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation2.badge,
  },
  // 12 ExtraBold — 2차 텍스트 스타일에 없는 조합이라 small.bold 위에 굵기만 올린다.
  countSm: { fontFamily: fontFamily.heavy, fontWeight: '800' },
});

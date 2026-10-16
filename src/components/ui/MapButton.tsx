import React, { forwardRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { c2, elevation2, radius2 } from '@/theme/v2';
import { Touchable } from './Touchable';

interface Props {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** 48 기본(내 위치·+), 52는 1 지도 검색창 옆 지도 설정, 44는 헤더의 뒤로·닫기 */
  size?: 52 | 48 | 44;
  /** 기본값에서 벗어난 설정이 있다는 점 표시(지도 설정 버튼). */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 지도 위 원형 버튼(Figma MapButton 533:1141). ref 는 PopoverMenu 위치 잡기(showPopoverMenu)에 쓴다. */
export const MapButton = forwardRef<View, Props>(function MapButton(
  { icon, onPress, accessibilityLabel, size = 48, dot, style },
  ref,
) {
  return (
    <Touchable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, { width: size, height: size }, style]}
    >
      <Icon name={icon} size={22} color={c2.text.primary} />
      {dot ? <View style={styles.dot} /> : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation2.control,
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brand,
    borderWidth: 1.5,
    borderColor: c2.border.inverse,
  },
});

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { Text } from './Text';

interface Props {
  /** 예: '체크인 · 1/2 · 10:42' — 화면이 조립한다. */
  label: string;
  style?: StyleProp<ViewStyle>;
}

/** 체크인 화면 상단 표시(Figma CheckinPill 534:1242). 누르는 요소가 아니다. */
export function CheckinPill({ label, style }: Props) {
  return (
    <View style={[styles.pill, style]} accessibilityRole="text">
      <Icon name="check" size={16} color={c2.text.inverse} />
      <Text v2="bodyS.bold" tone="inverse" numeric numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[6],
    paddingHorizontal: space[14],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brand,
    ...elevation2.control,
  },
});

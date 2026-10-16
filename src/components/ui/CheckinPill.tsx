import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { Text } from './Text';

interface Props {
  /** 예: '체크인 · 1/2 · 10:42' — 화면이 조립한다. */
  label: string;
  /** checkin = 파란 알약 + 체크(8 계열), edit = 회색 알약 + 연필(3-7 방문 기록 수정, Figma 699:3361). */
  kind?: 'checkin' | 'edit';
  style?: StyleProp<ViewStyle>;
}

/** 체크인 화면 상단 표시(Figma CheckinPill 534:1242). 누르는 요소가 아니다. */
export function CheckinPill({ label, kind = 'checkin', style }: Props) {
  const edit = kind === 'edit';
  return (
    <View style={[styles.pill, edit ? styles.edit : styles.checkin, style]} accessibilityRole="text">
      <Icon name={edit ? 'edit' : 'check'} size={16} color={edit ? c2.text.primary : c2.text.inverse} />
      <Text v2="bodyS.bold" tone={edit ? 'primary' : 'inverse'} numeric numberOfLines={1}>
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
  },
  checkin: { backgroundColor: c2.bg.brand, ...elevation2.control },
  edit: { backgroundColor: c2.bg.muted },
});

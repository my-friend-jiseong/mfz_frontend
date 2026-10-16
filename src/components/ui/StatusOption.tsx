import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { FieldStatus } from '@/types/entities';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { StatusMark, STATUS_LABEL } from './StatusMark';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props {
  status: FieldStatus;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** 조치 상태 선택 버튼 하나(Figma StatusOption 533:1228). 3열 그리드에서 flex:1 로 쓴다 → StatusOptionGroup. */
export function StatusOption({ status, selected, onPress, style }: Props) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={STATUS_LABEL[status]}
      style={[styles.base, selected ? styles.on : styles.off, style]}
    >
      <StatusMark status={status} variant={selected ? 'onBrand' : 'color'} />
      <Text v2={selected ? 'bodyM.extrabold' : 'bodyM.semibold'} tone={selected ? 'inverse' : 'body'}>
        {STATUS_LABEL[status]}
      </Text>
    </Touchable>
  );
}

const ORDER: FieldStatus[] = ['pending', 'in_progress', 'done'];

/** 조치 전·중·완료 3열. 칸 사이 8. */
export function StatusOptionGroup({
  value,
  onChange,
  style,
}: {
  value: FieldStatus | null;
  onChange: (s: FieldStatus) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityRole="radiogroup" style={[styles.group, style]}>
      {ORDER.map((s) => (
        <StatusOption key={s} status={s} selected={value === s} onPress={() => onChange(s)} style={styles.cell} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[6],
    borderRadius: radius2.xl,
  },
  on: { backgroundColor: c2.bg.brand, ...elevation2.brandCta },
  off: { borderWidth: 1.5, borderColor: c2.border.default },
  group: { flexDirection: 'row', gap: space[8] },
  cell: { flex: 1 },
});

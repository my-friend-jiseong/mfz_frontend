import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, radius2 } from '@/theme/v2';

interface Props {
  checked: boolean;
  /** 동의하지 않고 눌렀을 때(11-3) — 테두리를 진하게. */
  invalid?: boolean;
}

/** 22 네모 체크 표시(10-2·11-2). 누르는 영역은 줄 전체라 이 컴포넌트는 그림만 그린다. */
export function Checkbox2({ checked, invalid }: Props) {
  return (
    <View style={[styles.box, checked ? styles.on : invalid ? styles.invalid : styles.off]}>
      {checked ? <Icon name="check" size={14} color={c2.text.inverse} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 22, height: 22, borderRadius: radius2.xs, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: c2.bg.brand },
  off: { backgroundColor: c2.bg.canvas, borderWidth: 1.5, borderColor: c2.border.strong },
  invalid: { backgroundColor: c2.bg.canvas, borderWidth: 2, borderColor: c2.border.mutedStrong },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, radius2 } from '@/theme/v2';
import { Touchable } from './Touchable';

interface Props {
  added: boolean;
  onPress: () => void;
  /** 스크린리더용 대상 이름 — "낙동대로 351 목적지에 담기" */
  label: string;
}

/** 목록 행 오른쪽 목적지 담기(Figma AddToggle 533:1240). 담기 전 +, 담은 뒤 파란 ✓. 보이는 원 36, 상자 44. */
export function AddToggle({ added, onPress, label }: Props) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: added }}
      accessibilityLabel={added ? `${label} 목적지에서 빼기` : `${label} 목적지에 담기`}
      style={styles.box}
    >
      <View style={[styles.circle, added ? styles.on : styles.off]}>
        <Icon name={added ? 'check' : 'plus'} size={18} color={added ? c2.text.inverse : c2.text.body} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  box: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 36, height: 36, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: c2.bg.brand },
  off: { borderWidth: 1.5, borderColor: c2.border.strong },
});

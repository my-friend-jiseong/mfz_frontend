import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { FieldStatus } from '@/types/entities';
import { Icon, type IconName } from '@/components/icons';
import { c2, radius2, space } from '@/theme/v2';
import { StatusMark } from './StatusMark';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** L=44(지도 설정), M=40(분류 선택 등 촘촘한 줄) */
  size?: 'L' | 'M';
  /** 조치 상태 칩이면 상태 기호를 앞에 붙인다(12px). */
  status?: FieldStatus;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

/**
 * 2차 필터 칩(Figma FilterChip 533:1198). 선택되면 브랜드 파랑(앱 전체 공통 규칙).
 * 기존 `FilterChip`(24px, 색 tint)과 모양·API 가 달라 따로 둔다.
 */
export function FilterChip2({ label, selected, onPress, size = 'L', status, icon, style }: Props) {
  const fg = selected ? c2.text.inverse : c2.text.body;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.base,
        size === 'L' ? styles.L : styles.M,
        selected ? styles.on : styles.off,
        style,
      ]}
    >
      {status ? <StatusMark status={status} variant={selected ? 'onBrand' : 'color'} size={12} /> : null}
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      {/* 폭은 보이지 않는 사본(선택·안 선택 두 굵기)이 잡고, 보이는 글자는 그 위에 겹친다 — 고를 때 굵기가 바뀌어도
          칩 폭이 1~2px 움직여 옆 칩이 밀리지 않게. */}
      <View style={styles.textBox}>
        {/* 두 굵기 중 넓은 쪽으로(굵기마다 자간이 달라 어느 쪽이 넓은지 글자마다 다르다). */}
        <View style={styles.sizerBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Text v2="bodyS.bold">
            {label}
          </Text>
          <Text v2="bodyS.semibold" style={styles.sizer}>
            {label}
          </Text>
        </View>
        <Text v2={selected ? 'bodyS.bold' : 'bodyS.semibold'} style={[styles.label, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: space[6], borderRadius: radius2.full },
  L: { height: 44, paddingHorizontal: space[16] },
  M: { height: 40, paddingHorizontal: space[14] },
  // 선택돼도 1.5 테두리 자리를 투명으로 남긴다 — 빼면 칩 폭이 3px 줄어 옆 칩이 움찔한다.
  on: { backgroundColor: c2.bg.brand, borderWidth: 1.5, borderColor: 'transparent' },
  off: { borderWidth: 1.5, borderColor: c2.border.strong },
  textBox: { flexShrink: 0 },
  sizerBox: { opacity: 0 },
  sizer: { height: 0, overflow: 'hidden' },
  label: { ...StyleSheet.absoluteFillObject, textAlign: 'center' },
});

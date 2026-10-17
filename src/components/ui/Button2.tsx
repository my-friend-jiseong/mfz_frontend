import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { c2, elevation2, radius2, space, type Type2 } from '@/theme/v2';
import { opacity } from '@/theme/motion';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type Button2Variant = 'primary' | 'secondary' | 'tonal' | 'outline' | 'danger' | 'ghost';
export type Button2Size = 'L' | 'M';

interface Props {
  onPress?: () => void;
  variant?: Button2Variant;
  /** L=56 화면 하단 주 행동, M=48 보조·시트 안 */
  size?: Button2Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /**
   * 비활성 모양. dim(기본)=투명도만 낮춤, muted=회색 바탕·회색 글자·그림자 없음(11-11 발송 제한의 [인증번호 받기]).
   */
  disabledLook?: 'dim' | 'muted';
  fullWidth?: boolean;
  accessibilityLabel?: string;
  children: string;
  style?: StyleProp<ViewStyle>;
}

const VARIANT: Record<Button2Variant, { box: ViewStyle; fg: string }> = {
  primary: { box: { backgroundColor: c2.bg.brand }, fg: c2.text.inverse },
  secondary: { box: { backgroundColor: c2.bg.muted }, fg: c2.text.primary },
  tonal: {
    box: { backgroundColor: c2.bg.brandSubtle, borderWidth: 1.5, borderColor: c2.border.brandSubtle },
    fg: c2.text.brand,
  },
  outline: {
    box: { backgroundColor: c2.bg.canvas, borderWidth: 1.5, borderColor: c2.border.strong },
    fg: c2.text.primary,
  },
  danger: { box: { backgroundColor: c2.bg.dangerSubtle }, fg: c2.text.danger },
  ghost: { box: { backgroundColor: 'transparent' }, fg: c2.text.secondary },
};

const MUTED = { box: { backgroundColor: c2.bg.placeholder }, fg: c2.text.disabled };

const SIZE: Record<Button2Size, { height: number; padX: number; text: Type2 }> = {
  L: { height: 56, padX: 20, text: 'button' },
  M: { height: 48, padX: 16, text: 'bodyM.bold' },
};

/**
 * 2차 버튼(Figma Button 533:1129). 기존 `Button` 은 옮기지 않은 화면이 쓰고 있어 이름이 같은 variant
 * (secondary 등)의 모양이 달라 따로 둔다. 화면을 옮길 때 이걸로 바꾸고, 다 옮기면 Button 을 지운다.
 */
export function Button2({
  onPress,
  variant = 'primary',
  size = 'L',
  icon,
  loading,
  disabled,
  disabledLook = 'dim',
  fullWidth,
  accessibilityLabel,
  children,
  style,
}: Props) {
  const muted = !!disabled && !loading && disabledLook === 'muted';
  const v = muted ? MUTED : VARIANT[variant];
  const s = SIZE[size];
  const inactive = !!disabled || !!loading;
  return (
    <Touchable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={[
        styles.base,
        { height: s.height, paddingHorizontal: s.padX },
        v.box,
        // 파란 그림자는 화면 하단 주 행동(Primary L)에만 — M(시트 안·확인 창)은 Figma 에서 그림자 없음.
        variant === 'primary' && size === 'L' && !muted && elevation2.brandCta,
        fullWidth && styles.full,
        disabled && !loading && !muted && { opacity: opacity.disabled },
        style,
      ]}
    >
      {/* 로딩 중에도 글자 자리를 남겨 폭이 줄지 않게 한다 — 글자는 투명, 스피너는 위에 겹친다. */}
      <View style={[styles.row, loading && styles.hidden]}>
        {icon ? <Icon name={icon} size={20} color={v.fg} /> : null}
        <Text v2={s.text} style={{ color: v.fg }} numberOfLines={1}>
          {children}
        </Text>
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={v.fg} size="small" />
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius2.lg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  hidden: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
});

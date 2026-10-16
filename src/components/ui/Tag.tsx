import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { c2, radius2, space, type C2TextTone } from '@/theme/v2';
import { Text } from './Text';

export type TagTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONE: Record<TagTone, { bg: string; fg: C2TextTone }> = {
  neutral: { bg: c2.bg.muted, fg: 'secondary' },
  brand: { bg: c2.bg.brandSubtle, fg: 'brand' },
  success: { bg: c2.bg.successSubtle, fg: 'success' },
  warning: { bg: c2.bg.warningSubtle, fg: 'warning' },
  danger: { bg: c2.bg.dangerSubtle, fg: 'danger' },
};

interface Props {
  label: string;
  tone?: TagTone;
  /** 라벨 앞 작은 요소(아이콘 등). 간격 4. */
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** 분류·보고서 상태 같은 24px 라벨(Figma Tag 533:1178). */
export function Tag({ label, tone = 'neutral', leading, style }: Props) {
  const t = TONE[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }, style]}>
      {leading}
      <Text v2="small.semibold" tone={t.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[4],
    paddingHorizontal: 9,
    borderRadius: radius2.md,
  },
});

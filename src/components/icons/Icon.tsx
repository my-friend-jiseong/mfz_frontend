import React, { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { c2 } from '@/theme/v2';
import { ICONS, type IconName } from './iconData';

interface Props {
  name: IconName;
  /** 보이는 크기(px). 24 격자를 그대로 늘린다. Figma 에서 쓰는 크기: 16·18·20·22·24·28 */
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** 스크린리더 이름. 없으면 장식용으로 숨긴다(누르는 쪽 Pressable 에 이름을 단다). */
  accessibilityLabel?: string;
}

/**
 * 2차 아이콘(Figma Icons 섹션). `<Icon name="search" size={20} color={c2.text.primary} />`.
 * 웹에서도 react-native-svg 가 `<svg>` 로 그린다.
 */
// 가로 줄 안에서 입력칸 등 flex 형제에 밀려 아이콘이 줄어드는 것 방지(웹 실측: SearchBar 값 입력 시).
const NO_SHRINK = { flexShrink: 0 } as const;
// Active 아이콘의 연한 채움(Figma TabItem Active=On 의 Tint 레이어 opacity 0.14).
const ICON_TINT_OPACITY = 0.14;

export const Icon = memo(function Icon({
  name,
  size = 24,
  color = c2.text.primary,
  style,
  accessibilityLabel,
}: Props) {
  const parts = ICONS[name];
  // Svg 에 접근성 props 를 직접 주면 웹에서 DOM 속성으로 새어 경고가 난다 — 이름이 필요할 때만 View 로 감싼다.
  const svg = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={[NO_SHRINK, accessibilityLabel ? undefined : style]}>
      {parts.map((part, i) => {
        const [d, sw, flags = ''] = part as readonly [string, number, string?];
        const fillOnly = flags.includes('F');
        const tint = flags.includes('t');
        const filled = fillOnly || tint || flags.includes('f');
        const stroke = fillOnly ? undefined : flags.includes('w') ? c2.text.inverse : color;
        return (
          <Path
            key={i}
            d={d}
            fill={filled ? color : 'none'}
            fillOpacity={tint ? ICON_TINT_OPACITY : undefined}
            stroke={stroke}
            strokeWidth={fillOnly ? undefined : sw}
            strokeLinecap={flags.includes('b') ? 'butt' : 'round'}
            strokeLinejoin={flags.includes('m') ? 'miter' : 'round'}
          />
        );
      })}
    </Svg>
  );
  if (!accessibilityLabel) return svg;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={style}>
      {svg}
    </View>
  );
});

export type { IconName };

import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type AccessibilityState,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

// Depth 전략: 문서 흐름 안의 표면은 '테두리' 하나로만 위계를 만든다.
// 그림자(elevation)는 지도 위에 떠 있는 chrome 전용 — 두 전략을 섞지 않는다.
//
// `variant` prop 자체를 없앴다 (2026-07-30 §14 감사). 'elevated' 는 이미 callsite 0 으로
// 제거했고, 남은 'outline'/'flat' 도 **어디서도 넘기지 않아** 모든 Card 가 기본 outline 이었다.
// 값이 하나뿐인 prop 은 선택지처럼 보이면서 아무것도 선택하지 않는다 — 테두리 없는 표면이
// 정말 필요해지면 그때 이유와 함께 되살린다.
type Padding = 'none' | 'sm' | 'md' | 'lg';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  padding?: Padding;
  style?: StyleProp<ViewStyle>;
  // onPress 있을 때 screen reader 에 읽힐 라벨. 미지정 시 children 의 Text 가 자동 합성.
  accessibilityLabel?: string;
  // 누를 수 있는 카드가 항상 '버튼'인 건 아니다 — 체크리스트 항목은 checkbox 여야
  // 스크린 리더가 선택 여부를 읽는다. 기본값은 button.
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  // 스크린리더 커스텀 액션 (순서 이동 ▲▼ 등 — ReorderButtons.reorderA11yProps).
  accessibilityActions?: ReadonlyArray<AccessibilityActionInfo>;
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

const PADDING: Record<Padding, number> = {
  none: 0,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
};

export function Card({
  children,
  onPress,
  padding = 'lg',
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityActions,
  onAccessibilityAction,
}: Props) {
  const base: StyleProp<ViewStyle>[] = [
    styles.base,
    { padding: PADDING[padding] },
  ];

  // 안 눌리는 카드도 라벨·커스텀 액션은 넘긴다 — 예전엔 이 분기에서 a11y prop 을 전부 버렸다
  // (design-system.md 14절 기록). 역할은 넘기지 않는다: 누를 수 없는 카드에 button 은 거짓말이다.
  if (!onPress) {
    return (
      <View
        style={[base, style]}
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
      >
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      // 누름 피드백은 opacity 가 아니라 **표면 값**을 바꾼다 — 흰 카드 위에서 opacity 0.85 는
      // 1/255 밖에 안 움직여 사실상 피드백이 없었다(colors.surfacePressed 주석에 계산).
      // scale(0.97) 을 쓰지 않는 이유는 14절 — 값 변경으로 충분하고 reanimated 비용이 없다.
      // style 을 마지막에 두는 건 의도다: 선택된 카드(primaryMuted)는 이미 강한 상태라
      // 누름 색이 그걸 덮지 않는다.
      style={({ pressed }) => [
        ...base,
        pressed && { backgroundColor: colors.surfacePressed },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

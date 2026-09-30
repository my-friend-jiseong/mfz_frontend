import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing, touchTarget } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

interface Props {
  title: string;
  onBack: () => void;
  /** 오른쪽 액션(`···`, `나중에 다시 작성` 등). 편집 화면에는 `···` 를 두지 않는다(명세 §1.2). */
  right?: React.ReactNode;
}

/**
 * 지도 없는 푸시 화면의 헤더 — `←` + 제목 (명세 v2 §1.2 "모든 하위 화면은 ← 와 화면 제목").
 * 네이티브 스택 헤더를 쓰지 않는 이유: 체크인처럼 다른 탭 스택으로 건너온 화면은 네이티브
 * back 이 엉뚱한 곳(그 탭의 루트)으로 가거나 아예 안 보인다. 돌아갈 곳을 화면이 정한다.
 */
export function NavHeader({ title, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        style={({ pressed }) => [styles.back, pressed && { opacity: opacity.pressed }]}
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text variant="h3" numberOfLines={1} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/** 헤더 오른쪽 `···` 버튼. */
export function OverflowButton({ onPress, label = '더보기' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.overflow, pressed && { opacity: opacity.pressed }]}
    >
      <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget.control,
    paddingRight: spacing.lg,
  },
  back: {
    width: touchTarget.control,
    height: touchTarget.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  title: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  overflow: {
    width: touchTarget.control,
    height: touchTarget.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import { duration, rEasing, useReducedMotionPref } from '@/theme/motion';

interface Props {
  /** '선택한 현장' / '선택한 위치'. */
  label: string;
  title: string;
  meta: string;
  added: boolean;
  /** 이름을 누르면 5 현장 상세. 없으면 이름은 누를 수 없다(아직 현장이 아닌 위치). */
  onOpen?: () => void;
  /** 담기 / 담은 것 빼기(✓ 외근 목적지에 추가됨을 다시 누름). */
  onToggle: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** 있으면 오른쪽 위에 닫기(X). */
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** 지도에서 고른 현장·위치 카드(4-3 지도에서 고르기, 6 외근 준비 지도 핀). 버튼은 5 아래 줄과 같은 문구·모양. */
export function MapPickCard({ label, title, meta, added, onOpen, onToggle, loading, disabled, onClose, style }: Props) {
  // 카드가 뜨거나 담김 상태가 바뀌면 읽어 준다. 안드로이드는 accessibilityLiveRegion 이 맡는다.
  const announcement = `${label} ${title}, ${added ? '외근 목적지에 추가됨' : '외근 목적지에 추가 안 됨'}`;
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);
  // 나타날 때 살짝 아래에서 올라오고, 사라질 때는 제자리에서 흐려진다. 동작 줄이기면 투명도만.
  const reduced = useReducedMotionPref();
  const entering = reduced
    ? FadeIn.duration(duration.instant)
    : FadeInDown.duration(duration.base).easing(rEasing.enter).withInitialValues({ transform: [{ translateY: space[8] }] });
  return (
    <Animated.View
      entering={entering}
      exiting={FadeOut.duration(reduced ? duration.instant : duration.fast)}
      style={[styles.card, style]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.labelRow}>
        <Text v2="small.semibold" tone="tertiary" style={styles.flex}>
          {label}
        </Text>
        {onClose ? (
          <Touchable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Icon name="close" size={18} color={c2.text.tertiary} />
          </Touchable>
        ) : null}
      </View>
      <Touchable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole="button"
        pressedOpacity={onOpen ? 0.6 : 1}
        noAutoHitSlop
      >
        <Text v2="title.s" numberOfLines={1}>
          {title}
        </Text>
      </Touchable>
      <Text v2="bodyS.regular" tone="tertiary" numberOfLines={1}>
        {meta}
      </Text>
      <Button2
        variant={added ? 'tonal' : 'primary'}
        icon={added ? 'check' : undefined}
        loading={loading}
        disabled={disabled}
        onPress={onToggle}
        fullWidth
        style={styles.btn}
      >
        {added ? '외근 목적지에 추가됨' : '외근 목적지에 추가'}
      </Button2>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    padding: space[16],
    gap: space[2],
    borderRadius: radius2['2xl'],
    backgroundColor: c2.bg.canvas,
    ...elevation2.popover,
  },
  flex: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  // 44 터치 영역을 카드 안쪽 여백 위로 겹쳐 라벨 줄 높이는 그대로 둔다.
  close: {
    width: 44,
    height: 44,
    marginVertical: -space[14],
    marginRight: -space[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: { marginTop: space[12] },
});

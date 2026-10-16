import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, space } from '@/theme/v2';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props {
  title: string;
  onBack: () => void;
  /** 오른쪽 글자 버튼(11-2 '로그인'). */
  right?: { label: string; onPress: () => void };
}

/**
 * 2차 푸시 화면 머리(Figma 'Header · …' 10-1·10-2·11-2·11-4 등): ← 44 + 제목 18 ExtraBold.
 * 상태 표시줄 아래 48(버튼 44 + 여유 4). 상태 표시줄 여백은 화면의 SafeScreen 이 준다.
 */
export function PageHeader({ title, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      <Touchable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="뒤로"
        style={styles.back}
      >
        <Icon name="arrow-left" size={24} color={c2.text.primary} />
      </Touchable>
      <Text v2="title.xs" tone="primary" numberOfLines={1} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {right ? (
        <Touchable
          onPress={right.onPress}
          accessibilityRole="button"
          accessibilityLabel={right.label}
          style={styles.right}
        >
          <Text v2="bodyM.semibold" tone="secondary">
            {right.label}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space[4],
    paddingRight: space[12],
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, marginLeft: space[4] },
  right: { height: 44, justifyContent: 'center', paddingHorizontal: space[8] },
});

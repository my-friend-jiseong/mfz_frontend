import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { c2, space } from '@/theme/v2';

/**
 * X 로 닫는 보고서 모달 머리(Figma 9-2·9-6·9-8·9-11 'Header'): 상태 표시줄 아래 4 에 X 44 + 제목 Title/XS.
 * 상태 표시줄 여백은 화면이 준다(insets.top).
 */
export function ReportModalHeader({
  title,
  onClose,
  closeLabel = '닫기',
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <Touchable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} style={styles.close}>
        <Icon name="close" size={24} color={c2.text.primary} />
      </Touchable>
      <Text v2="title.xs" accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 52, paddingTop: space[4], paddingLeft: space[4], flexDirection: 'row', alignItems: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, marginLeft: space[4], marginRight: space[16] },
});

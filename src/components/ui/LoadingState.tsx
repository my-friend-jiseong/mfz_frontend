import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

interface Props {
  label?: string;
  inline?: boolean;
}

export function LoadingState({ label = '불러오는 중', inline = false }: Props) {
  if (inline) {
    return (
      <View style={styles.inline}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text variant="bodySm" color="textMuted">
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="bodySm" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

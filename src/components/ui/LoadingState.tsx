import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, fontSize } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

interface Props {
  label?: string;
  inline?: boolean;
}

export function LoadingState({ label = '불러오는 중', inline = false }: Props) {
  if (inline) {
    return (
      <View style={styles.inline}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.inlineLabel}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.blockLabel}>{label}</Text>
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
  blockLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});

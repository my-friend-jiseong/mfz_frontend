import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight, lineHeight } from '@/theme/spacing';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  title: string;
  description?: string;
  icon?: IonName;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: Props) {
  return (
    <View style={styles.container}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={32} color={colors.textSubtle} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.base,
    color: colors.text,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
    textAlign: 'center',
    lineHeight: lineHeight.base,
  },
  desc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: lineHeight.sm,
  },
  action: { marginTop: spacing.lg },
});

import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

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
      <Text variant="body" weight="semibold" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="bodySm" color="textMuted" align="center">
          {description}
        </Text>
      ) : null}
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
  title: { marginBottom: spacing.xs },
  action: { marginTop: spacing.lg },
});

import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/spacing';

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, description, action }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="h3">{title}</Text>
        {description ? (
          <Text variant="bodySm" color="textMuted" style={styles.desc}>
            {description}
          </Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  text: { flex: 1 },
  desc: { marginTop: 2 },
  action: { paddingTop: 2 },
});

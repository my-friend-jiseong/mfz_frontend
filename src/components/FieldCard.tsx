import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { FIELD_STATUS_LABEL, type Field } from '@/types/entities';
import { fieldTitle } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';

interface Props {
  field: Field;
  onPress?: () => void;
  // 선택 모드(외근 시작 현장 선택) — brand 테두리+배경으로 선택 상태를 표시.
  selected?: boolean;
  // 좌측 체크박스 노출. selected 와 함께 쓰면 목록이 체크리스트로 동작한다.
  showCheckbox?: boolean;
}

const STATUS_SHAPE: Record<Field['status'], string> = {
  pending: '●',
  in_progress: '▲',
  done: '■',
};

export function FieldCard({ field, onPress, selected, showCheckbox }: Props) {
  const statusColor = colors.fieldStatus[field.status];
  const hasMeta =
    !!field.projectName || (field.categories && field.categories.length > 0);
  // 제목 = name||address. name 이 제목으로 올라가면 address 는 부제로 내려 정보 유지.
  const title = fieldTitle(field);
  const subtitle = field.name?.trim()
    ? [field.address, field.addressDetail].filter(Boolean).join(' ')
    : field.addressDetail;

  const content = (
    <>
      <View style={styles.header}>
        <View style={[styles.statusChip, { backgroundColor: withAlpha(statusColor, 0.13) }]}>
          <Text variant="caption" style={{ color: statusColor }}>
            {STATUS_SHAPE[field.status]}
          </Text>
          <Text variant="caption" weight="semibold" style={{ color: statusColor }}>
            {FIELD_STATUS_LABEL[field.status]}
          </Text>
        </View>
      </View>
      <Text variant="body" weight="semibold">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodySm" color="textMuted" style={styles.detail}>
          {subtitle}
        </Text>
      ) : null}
      {hasMeta ? (
        <View style={styles.metaRow}>
          {field.projectName ? (
            <View style={styles.metaItem}>
              <Ionicons name="folder-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.metaText}>
                {field.projectName}
              </Text>
            </View>
          ) : null}
          {field.categories && field.categories.length > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.metaText}>
                {field.categories.join(', ')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={showCheckbox ? 'checkbox' : undefined}
      accessibilityState={showCheckbox ? { checked: !!selected } : undefined}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      {showCheckbox ? (
        <View style={styles.checkRow}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.primary : colors.textMuted}
          />
          <View style={styles.checkBody}>{content}</View>
        </View>
      ) : (
        content
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  pressed: { opacity: 0.7 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkBody: { flex: 1 },
  header: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    gap: 4,
  },
  detail: { marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  metaText: { flexShrink: 1 },
});

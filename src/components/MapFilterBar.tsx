import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';
import { FIELD_STATUS_LABEL, type FieldStatus } from '@/types/entities';

export type DisplayMode = 'markers' | 'heatmap' | 'choropleth';
export type AttachmentKind = 'text' | 'photo';
export type VisibleAttachments = Record<AttachmentKind, boolean>;
export type RangePreset = 'all' | '30d' | '7d' | '1d';
type GroupKey = 'display' | 'visibility' | 'filter';

interface Props {
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  selectedStatuses: FieldStatus[];
  onToggleStatus: (status: FieldStatus) => void;
  rangePreset: RangePreset;
  onChangeRangePreset: (preset: RangePreset) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  visibleAttachments: VisibleAttachments;
  onToggleAttachment: (kind: AttachmentKind) => void;
  showBoundary: boolean;
  onToggleBoundary: () => void;
}

const DISPLAY_LABEL: Record<DisplayMode, string> = {
  markers: '마커',
  heatmap: '히트맵',
  choropleth: '단계구분도',
};

const RANGE_LABEL: Record<RangePreset, string> = {
  all: '전체',
  '30d': '최근 30일',
  '7d': '최근 7일',
  '1d': '오늘',
};

const STATUS_CHIPS: { value: FieldStatus; label: string }[] = [
  { value: 'pending', label: FIELD_STATUS_LABEL.pending },
  { value: 'in_progress', label: FIELD_STATUS_LABEL.in_progress },
  { value: 'done', label: FIELD_STATUS_LABEL.done },
];

const ATTACHMENT_CHIPS: { kind: AttachmentKind; label: string }[] = [
  { kind: 'text', label: '글자 메모' },
  { kind: 'photo', label: '사진' },
];

export function MapFilterBar({
  displayMode,
  onChangeDisplayMode,
  selectedStatuses,
  onToggleStatus,
  rangePreset,
  onChangeRangePreset,
  availableTags,
  selectedTags,
  onToggleTag,
  visibleAttachments,
  onToggleAttachment,
  showBoundary,
  onToggleBoundary,
}: Props) {
  const [expanded, setExpanded] = useState<GroupKey | null>(null);

  const toggleGroup = (key: GroupKey) =>
    setExpanded((prev) => (prev === key ? null : key));

  const displayActive = displayMode !== 'markers';
  const rangeActive = rangePreset !== 'all';
  const filterActiveCount =
    selectedStatuses.length + (rangeActive ? 1 : 0) + selectedTags.length;

  // 표시 여부: 기본 = 메모·사진 ON, 경계 OFF.
  const attachmentOnCount =
    (visibleAttachments.text ? 1 : 0) +
    (visibleAttachments.photo ? 1 : 0);
  const allAttachmentsOn = attachmentOnCount === 2;
  const visibilityAtDefault = allAttachmentsOn && !showBoundary;
  const visibilityOnCount = attachmentOnCount + (showBoundary ? 1 : 0);

  return (
    <View style={styles.container}>
      <View style={styles.groupRow}>
        <GroupChip
          label="표시 방식"
          summary={displayActive ? DISPLAY_LABEL[displayMode] : null}
          active={displayActive}
          expanded={expanded === 'display'}
          onPress={() => toggleGroup('display')}
        />
        <GroupChip
          label="표시 여부"
          summary={
            !visibilityAtDefault ? `${visibilityOnCount}개 표시` : null
          }
          active={!visibilityAtDefault}
          expanded={expanded === 'visibility'}
          onPress={() => toggleGroup('visibility')}
        />
        <GroupChip
          label="필터"
          summary={filterActiveCount > 0 ? `${filterActiveCount}개 적용` : null}
          active={filterActiveCount > 0}
          expanded={expanded === 'filter'}
          onPress={() => toggleGroup('filter')}
        />
      </View>

      {expanded === 'display' ? (
        <ExpandedRow>
          {(['markers', 'heatmap', 'choropleth'] as DisplayMode[]).map((mode) => {
            const active = displayMode === mode;
            return (
              <SubChip
                key={mode}
                label={DISPLAY_LABEL[mode]}
                active={active}
                onPress={() => onChangeDisplayMode(mode)}
              />
            );
          })}
        </ExpandedRow>
      ) : null}

      {expanded === 'visibility' ? (
        <ExpandedRow>
          {ATTACHMENT_CHIPS.map((a) => {
            const on = visibleAttachments[a.kind];
            return (
              <SubChip
                key={a.kind}
                label={a.label}
                active={on}
                onPress={() => onToggleAttachment(a.kind)}
              />
            );
          })}
          <SubChip
            label="시/군/구 경계"
            active={showBoundary}
            onPress={onToggleBoundary}
          />
        </ExpandedRow>
      ) : null}

      {expanded === 'filter' ? (
        <View>
          <ExpandedRow>
            <SubLabel>기간</SubLabel>
            {(['all', '30d', '7d', '1d'] as RangePreset[]).map((p) => (
              <SubChip
                key={p}
                label={RANGE_LABEL[p]}
                active={rangePreset === p}
                onPress={() => onChangeRangePreset(p)}
              />
            ))}
          </ExpandedRow>
          <ExpandedRow>
            <SubLabel>상태</SubLabel>
            {STATUS_CHIPS.map((s) => {
              const active = selectedStatuses.includes(s.value);
              const accent = colors.fieldStatus[s.value];
              return (
                <SubChip
                  key={s.value}
                  label={s.label}
                  active={active}
                  accent={accent}
                  onPress={() => onToggleStatus(s.value)}
                />
              );
            })}
          </ExpandedRow>
          <ExpandedRow>
            <SubLabel>태그</SubLabel>
            {availableTags.length === 0 ? (
              <Text style={styles.emptyHint}>등록된 태그 없음</Text>
            ) : (
              availableTags.map((tag) => (
                <SubChip
                  key={tag}
                  label={tag}
                  active={selectedTags.includes(tag)}
                  onPress={() => onToggleTag(tag)}
                />
              ))
            )}
          </ExpandedRow>
        </View>
      ) : null}
    </View>
  );
}

function GroupChip({
  label,
  summary,
  active,
  expanded,
  onPress,
}: {
  label: string;
  summary: string | null;
  active: boolean;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.groupChip,
        active && styles.groupChipActive,
        expanded && styles.groupChipExpanded,
      ]}
    >
      <Text
        style={[
          styles.groupChipLabel,
          active && styles.groupChipLabelActive,
          expanded && styles.groupChipLabelExpanded,
        ]}
      >
        {label}
      </Text>
      {summary ? (
        <View style={styles.summaryPill}>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : null}
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={14}
        color={
          expanded
            ? colors.primary
            : active
              ? colors.primary
              : colors.textMuted
        }
      />
    </Pressable>
  );
}

function ExpandedRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.expandedWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.expandedRow}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subLabel}>{children}</Text>;
}

function SubChip({
  label,
  active,
  disabled,
  accent,
  onPress,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
  onPress?: () => void;
}) {
  const baseStyle = [
    styles.subChip,
    active && (accent
      ? { backgroundColor: withAlpha(accent, 0.13), borderColor: accent }
      : styles.subChipActive),
    disabled && styles.subChipDisabled,
  ];
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={baseStyle}>
      <Text
        style={[
          styles.subChipLabel,
          active && (accent ? { color: accent, fontWeight: '700' } : styles.subChipLabelActive),
          disabled && styles.subChipLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  groupChipActive: {
    borderColor: colors.primary,
    backgroundColor: withAlpha(colors.primary, 0.06),
  },
  groupChipExpanded: {
    borderColor: colors.primary,
    backgroundColor: withAlpha(colors.primary, 0.09),
  },
  groupChipLabel: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
  },
  groupChipLabelActive: { color: colors.primary },
  groupChipLabelExpanded: { color: colors.primary, fontWeight: '700' },
  summaryPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  summaryText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },
  expandedWrap: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  expandedRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  subLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    marginRight: spacing.xs,
    minWidth: 36,
  },
  subChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  subChipActive: {
    borderColor: colors.primary,
    backgroundColor: withAlpha(colors.primary, 0.08),
  },
  subChipDisabled: {
    opacity: 0.5,
  },
  subChipLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  subChipLabelActive: { color: colors.primary, fontWeight: '700' },
  subChipLabelDisabled: { color: colors.textMuted },
  emptyHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingHorizontal: spacing.sm,
  },
});

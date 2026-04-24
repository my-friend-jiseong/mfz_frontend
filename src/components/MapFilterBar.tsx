import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { FieldStatus } from '@/types/entities';

export type DisplayMode = 'markers' | 'heatmap' | 'choropleth';
export type AttachmentKind = 'text' | 'voice' | 'photo';
export type VisibleAttachments = Record<AttachmentKind, boolean>;
type GroupKey = 'display' | 'visibility' | 'filter';

interface Props {
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  selectedStatuses: FieldStatus[];
  onToggleStatus: (status: FieldStatus) => void;
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

const STATUS_CHIPS: { value: FieldStatus; label: string }[] = [
  { value: 'pending', label: '대기' },
  { value: 'in_progress', label: '진행중' },
  { value: 'done', label: '완료' },
];

const ATTACHMENT_CHIPS: { kind: AttachmentKind; label: string }[] = [
  { kind: 'text', label: '글자 메모' },
  { kind: 'voice', label: '음성 메모' },
  { kind: 'photo', label: '사진' },
];

export function MapFilterBar({
  displayMode,
  onChangeDisplayMode,
  selectedStatuses,
  onToggleStatus,
  visibleAttachments,
  onToggleAttachment,
  showBoundary,
  onToggleBoundary,
}: Props) {
  const [expanded, setExpanded] = useState<GroupKey | null>(null);

  const toggleGroup = (key: GroupKey) =>
    setExpanded((prev) => (prev === key ? null : key));

  // 각 그룹이 "활성 선택"을 가졌는지 요약
  const displayActive = displayMode !== 'markers';
  const filterActiveCount = selectedStatuses.length; // 추후 기간·주제 포함

  // 표시 여부: 기본 상태 = 메모·음성·사진 ON, 경계 OFF. 기본에서 벗어나면 "active"
  const attachmentOnCount =
    (visibleAttachments.text ? 1 : 0) +
    (visibleAttachments.voice ? 1 : 0) +
    (visibleAttachments.photo ? 1 : 0);
  const allAttachmentsOn = attachmentOnCount === 3;
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
        <ExpandedRow>
          <SubChip label="시작일/종료일 (UI)" active={false} onPress={() => {}} />
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
          <SubChip label="주제" disabled />
        </ExpandedRow>
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
      ? { backgroundColor: accent + '22', borderColor: accent }
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
    backgroundColor: colors.primary + '10',
  },
  groupChipExpanded: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
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
    backgroundColor: colors.primary + '15',
  },
  subChipDisabled: {
    opacity: 0.5,
  },
  subChipLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  subChipLabelActive: { color: colors.primary, fontWeight: '700' },
  subChipLabelDisabled: { color: colors.textMuted },
  disabledHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    alignSelf: 'center',
    marginLeft: spacing.xs,
  },
});

import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { withAlpha } from '@/theme/withAlpha';
import { FIELD_STATUS_LABEL, type FieldStatus } from '@/types/entities';

export type DisplayMode = 'markers' | 'heatmap' | 'choropleth';
export type AttachmentKind = 'text' | 'photo';
export type VisibleAttachments = Record<AttachmentKind, boolean>;
export type RangePreset = 'all' | '30d' | '7d' | '1d';

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

// 벤치마크(네이버·카카오 등 지도 앱) 패턴 — 지도 설정을 상단을 가로지르는 흰 바 대신
// 우측 상단 동그란 '레이어' 버튼 하나로 접어 둔다. 평소엔 지도가 위까지 꽉 차 보이고,
// 버튼을 누르면 표시 방식·표시 여부·필터를 한 패널 안에서 수정한다.
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
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const displayActive = displayMode !== 'markers';
  const rangeActive = rangePreset !== 'all';
  const filterActiveCount =
    selectedStatuses.length + (rangeActive ? 1 : 0) + selectedTags.length;

  // 표시 여부: 기본 = 메모·사진 ON, 경계 OFF.
  const allAttachmentsOn = visibleAttachments.text && visibleAttachments.photo;
  const visibilityAtDefault = allAttachmentsOn && !showBoundary;

  // 버튼 위 점 배지 — 기본값에서 벗어난 설정이 하나라도 있으면 표시.
  const anyActive = displayActive || !visibilityAtDefault || filterActiveCount > 0;

  // 패널 폭/최대 높이 — 작은 화면에서도 좌우 여백을 남기고, 세로로 길면 스크롤.
  const panelWidth = Math.min(320, screenWidth - spacing.lg * 2);
  const panelMaxHeight = screenHeight * 0.6;

  return (
    // 지도 위 전면 오버레이 — pointerEvents box-none 으로 버튼/패널 밖 영역은 지도로 통과.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
          accessibilityLabel="지도 설정 닫기"
        />
      ) : null}

      <View
        style={[styles.anchor, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityRole="button"
          accessibilityLabel={open ? '지도 설정 닫기' : '지도 설정 열기'}
        >
          <Ionicons
            name={open ? 'close' : 'layers-outline'}
            size={22}
            color={open ? colors.primary : colors.text}
          />
          {anyActive && !open ? <View style={styles.fabBadge} /> : null}
        </Pressable>

        {open ? (
          <View style={[styles.panel, { width: panelWidth }]}>
            <View style={styles.panelHeader}>
              <Text variant="bodySm" weight="bold">
                지도 설정
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="닫기"
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: panelMaxHeight }}
              contentContainerStyle={styles.panelBody}
              showsVerticalScrollIndicator={false}
            >
              <Section label="표시 방식" first>
                {(['markers', 'heatmap', 'choropleth'] as DisplayMode[]).map(
                  (mode) => (
                    <SubChip
                      key={mode}
                      label={DISPLAY_LABEL[mode]}
                      active={displayMode === mode}
                      onPress={() => onChangeDisplayMode(mode)}
                    />
                  ),
                )}
              </Section>

              <Section label="표시 여부">
                {ATTACHMENT_CHIPS.map((a) => (
                  <SubChip
                    key={a.kind}
                    label={a.label}
                    active={visibleAttachments[a.kind]}
                    onPress={() => onToggleAttachment(a.kind)}
                  />
                ))}
                <SubChip
                  label="시/군/구 경계"
                  active={showBoundary}
                  onPress={onToggleBoundary}
                />
              </Section>

              <Section label="기간">
                {(['all', '30d', '7d', '1d'] as RangePreset[]).map((p) => (
                  <SubChip
                    key={p}
                    label={RANGE_LABEL[p]}
                    active={rangePreset === p}
                    onPress={() => onChangeRangePreset(p)}
                  />
                ))}
              </Section>

              <Section label="상태">
                {STATUS_CHIPS.map((s) => (
                  <SubChip
                    key={s.value}
                    label={s.label}
                    active={selectedStatuses.includes(s.value)}
                    accent={colors.fieldStatus[s.value]}
                    onPress={() => onToggleStatus(s.value)}
                  />
                ))}
              </Section>

              <Section label="태그">
                {availableTags.length === 0 ? (
                  <Text variant="caption" color="textMuted" style={styles.emptyHint}>
                    등록된 태그 없음
                  </Text>
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
              </Section>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Section({
  label,
  first,
  children,
}: {
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, !first && styles.sectionDivider]}>
      <Text
        variant="caption"
        weight="bold"
        color="textMuted"
        style={styles.sectionLabel}
      >
        {label}
      </Text>
      <View style={styles.sectionChips}>{children}</View>
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
      ? { backgroundColor: withAlpha(accent, 0.13), borderColor: accent }
      : styles.subChipActive),
    disabled && styles.subChipDisabled,
  ];
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={baseStyle}>
      <Text
        variant="bodySm"
        weight={active ? 'bold' : 'regular'}
        style={
          active && accent
            ? { color: accent }
            : active
              ? { color: colors.primary }
              : { color: colors.textMuted }
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.raised,
  },
  fabPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  fabBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  panel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.raised,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelBody: {
    paddingBottom: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  emptyHint: {
    fontStyle: 'italic',
    paddingHorizontal: spacing.sm,
  },
});

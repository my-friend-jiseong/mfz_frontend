import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { withAlpha } from '@/theme/withAlpha';
import { FIELD_STATUS_LABEL, type FieldStatus } from '@/types/entities';

export type DisplayMode = 'markers' | 'heatmap' | 'choropleth';
export type BaseMapType = 'roadmap' | 'skyview' | 'hybrid';
export type AttachmentKind = 'text' | 'photo';
export type VisibleAttachments = Record<AttachmentKind, boolean>;
export type RangePreset = 'all' | '30d' | '7d' | '1d';

interface Props {
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  baseMapType: BaseMapType;
  onChangeBaseMapType: (type: BaseMapType) => void;
  showTerrain: boolean;
  onToggleTerrain: () => void;
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

const BASE_MAP_LABEL: Record<BaseMapType, string> = {
  roadmap: '일반',
  skyview: '위성',
  hybrid: '하이브리드',
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
// 우측 상단 동그란 '레이어' 버튼 하나로 접어 둔다. 버튼을 누르면 아래에서 올라오는
// 바텀시트(gorhom)로 표시 방식·표시 여부·필터를 한 곳에서 수정한다.
//   - 아래로 끌어내리면 닫힘(enablePanDownToClose) — 현장 목록 시트와 동일한 제스처.
//   - backdrop 은 시트가 올라오는 만큼 서서히 어두워짐(BottomSheetBackdrop, 페이드).
//   - 내용이 길면 시트 안에서 스크롤(BottomSheetScrollView), 짧으면 콘텐츠 높이로 자동.
export function MapFilterBar({
  displayMode,
  onChangeDisplayMode,
  baseMapType,
  onChangeBaseMapType,
  showTerrain,
  onToggleTerrain,
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
  const { height: screenHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetModal>(null);

  const displayActive = displayMode !== 'markers';
  // 베이스 지도가 일반이 아니거나 지형 오버레이가 켜져 있으면 기본 이탈로 본다.
  const baseMapActive = baseMapType !== 'roadmap' || showTerrain;
  const rangeActive = rangePreset !== 'all';
  const filterActiveCount =
    selectedStatuses.length + (rangeActive ? 1 : 0) + selectedTags.length;

  // 표시 여부: 기본 = 메모·사진 ON, 경계 OFF.
  const allAttachmentsOn = visibleAttachments.text && visibleAttachments.photo;
  const visibilityAtDefault = allAttachmentsOn && !showBoundary;

  // 버튼 위 점 배지 — 기본값에서 벗어난 설정이 하나라도 있으면 표시.
  const anyActive =
    displayActive || baseMapActive || !visibilityAtDefault || filterActiveCount > 0;

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    // 지도 위 전면 오버레이 — pointerEvents box-none 으로 버튼 밖 영역은 지도로 통과.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[styles.anchor, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => sheetRef.current?.present()}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityRole="button"
          accessibilityLabel="지도 설정 열기"
        >
          <Ionicons name="layers-outline" size={22} color={colors.text} />
          {anyActive ? <View style={styles.fabBadge} /> : null}
        </Pressable>
      </View>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        maxDynamicContentSize={screenHeight * 0.8}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.grabber}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.sheetBody,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <Text variant="h3" style={styles.sheetTitle}>
            지도 설정
          </Text>

          <Section label="지도 종류" first>
            {(['roadmap', 'skyview', 'hybrid'] as BaseMapType[]).map((type) => (
              <SubChip
                key={type}
                label={BASE_MAP_LABEL[type]}
                active={baseMapType === type}
                onPress={() => onChangeBaseMapType(type)}
              />
            ))}
            <SubChip label="지형" active={showTerrain} onPress={onToggleTerrain} />
          </Section>

          <Section label="표시 방식">
            {(['markers', 'heatmap', 'choropleth'] as DisplayMode[]).map((mode) => (
              <SubChip
                key={mode}
                label={DISPLAY_LABEL[mode]}
                active={displayMode === mode}
                onPress={() => onChangeDisplayMode(mode)}
              />
            ))}
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
        </BottomSheetScrollView>
      </BottomSheetModal>
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
  sheetBg: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  grabber: {
    backgroundColor: colors.border,
    width: 40,
    height: 4,
  },
  sheetTitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetBody: {
    paddingTop: spacing.xs,
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

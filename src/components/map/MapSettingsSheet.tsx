import React from 'react';
import { Image, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppSheet } from '@/components/ui/AppSheet';
import { Button2 } from '@/components/ui/Button2';
import { FilterChip2 } from '@/components/ui/FilterChip2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import type { FieldStatus } from '@/types/entities';
import type { BaseMapType, DisplayMode, RangePreset } from '@/stores/mapSettingsStore';
import { palette } from '@/theme/palette';
import { c2, radius2, space } from '@/theme/v2';

export interface MapSettingsProps {
  displayMode: DisplayMode;
  onChangeDisplayMode: (mode: DisplayMode) => void;
  baseMapType: BaseMapType;
  onChangeBaseMapType: (type: BaseMapType) => void;
  /** 빈 배열 = 셋 다 보임. */
  selectedStatuses: FieldStatus[];
  onChangeStatuses: (next: FieldStatus[]) => void;
  rangePreset: RangePreset;
  onChangeRangePreset: (preset: RangePreset) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  /** 지금 설정으로 지도에 보이는 현장 수 — [현장 N곳 보기]. */
  visibleCount: number;
  onReset: () => void;
}

interface Props extends MapSettingsProps {
  open: boolean;
  onClose: () => void;
}

const DISPLAY: { mode: DisplayMode; label: string }[] = [
  { mode: 'markers', label: '마커' },
  { mode: 'heatmap', label: '히트맵' },
  // 인수인계 '용어·문구 규칙': 단계구분도 → 구역별
  { mode: 'choropleth', label: '구역별' },
];

const STATUSES: FieldStatus[] = ['pending', 'in_progress', 'done'];

const RANGES: { value: RangePreset; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: '7d', label: '1주' },
  { value: '30d', label: '1달' },
  { value: '90d', label: '3달' },
];

const BASE_MAPS: { type: BaseMapType; label: string; thumb: ImageSourcePropType }[] = [
  { type: 'roadmap', label: '일반', thumb: require('@/assets/mapThumbnails/roadmap.png') },
  { type: 'skyview', label: '위성', thumb: require('@/assets/mapThumbnails/skyview.png') },
  { type: 'hybrid', label: '위성 + 도로', thumb: require('@/assets/mapThumbnails/hybrid.png') },
];

// 표시 방식 카드 모서리·높이 — Figma 1-3 에 변수 없이 16·84.
const CARD_RADIUS = radius2.xl;

/** 1-3 지도 설정 시트(Figma 537:1775). 고르는 즉시 지도에 반영되고, 아래 버튼은 닫기다. */
export function MapSettingsSheet({ open, onClose, ...p }: Props) {
  const statusOn = (s: FieldStatus) => p.selectedStatuses.length === 0 || p.selectedStatuses.includes(s);
  const toggleStatus = (s: FieldStatus) => {
    const current = p.selectedStatuses.length === 0 ? STATUSES : p.selectedStatuses;
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    // 하나도 안 고르면 지도가 비므로 마지막 하나는 끄지 않는다. 셋 다면 '전체'(빈 배열)로.
    if (next.length === 0) return;
    p.onChangeStatuses(next.length === STATUSES.length ? [] : STATUSES.filter((x) => next.includes(x)));
  };

  return (
    <AppSheet open={open} onClose={onClose} closeButton={false} scrollable topRadius={radius2['3xl']}>
      <View style={styles.head}>
        <Text v2="title.m" style={styles.flex} accessibilityRole="header">
          지도 설정
        </Text>
        <Touchable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
          <Icon name="close" size={22} color={c2.text.primary} />
        </Touchable>
      </View>

      <Section label="표시 방식">
        <View style={styles.row3}>
          {DISPLAY.map(({ mode, label }) => {
            const on = p.displayMode === mode;
            return (
              <Touchable
                key={mode}
                onPress={() => p.onChangeDisplayMode(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.modeCard, on ? styles.modeOn : styles.modeOff]}
              >
                <ModeGlyph mode={mode} />
                <Text v2={on ? 'bodyS.bold' : 'bodyS.semibold'} tone={on ? 'brand' : 'body'}>
                  {label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </Section>

      <Section label="최근 조치 상태">
        <View style={styles.chips}>
          {STATUSES.map((s) => (
            <FilterChip2 key={s} label={STATUS_LABEL[s]} status={s} selected={statusOn(s)} onPress={() => toggleStatus(s)} />
          ))}
        </View>
      </Section>

      {p.availableTags.length > 0 ? (
        <Section label="분류" bleed>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
            {p.availableTags.map((tag) => (
              <FilterChip2 key={tag} label={tag} selected={p.selectedTags.includes(tag)} onPress={() => p.onToggleTag(tag)} />
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Section label="최근 방문일">
        <View style={styles.segment}>
          {RANGES.map(({ value, label }) => {
            const on = p.rangePreset === value;
            return (
              <Touchable
                key={value}
                onPress={() => p.onChangeRangePreset(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.segItem, on && styles.segOn]}
              >
                <Text v2={on ? 'bodyS.bold' : 'bodyS.semibold'} tone={on ? 'inverse' : 'secondary'}>
                  {label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </Section>

      <Section label="배경 지도">
        <View style={styles.row3}>
          {BASE_MAPS.map(({ type, label, thumb }) => {
            const on = p.baseMapType === type;
            return (
              <Touchable
                key={type}
                onPress={() => p.onChangeBaseMapType(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`배경 지도 ${label}`}
                style={styles.baseItem}
              >
                <View style={styles.thumb}>
                  <Image source={thumb} style={styles.thumbImg} />
                </View>
                <Text v2={on ? 'caption.bold' : 'caption.semibold'} tone={on ? 'brand' : 'secondary'}>
                  {label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </Section>

      <View style={styles.footer}>
        <Button2 variant="secondary" onPress={p.onReset}>
          초기화
        </Button2>
        <Button2 onPress={onClose} style={styles.flex}>
          {`현장 ${p.visibleCount}곳 보기`}
        </Button2>
      </View>
    </AppSheet>
  );
}

function Section({ label, bleed, children }: { label: string; bleed?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.section, bleed && styles.bleed]}>
      <Text v2="bodyS.bold" tone="secondary" style={[styles.label, bleed && styles.labelBleed]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// 표시 방식 그림(26). 여러 색이라 Icon(한 색) 대신 직접 그린다 — Figma 1-3 의 벡터 그대로.
function ModeGlyph({ mode }: { mode: DisplayMode }) {
  if (mode === 'markers') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path
          d="M8.9375 17.875C8.125 15.8438 2.4375 11.375 2.4375 7.71875C2.4375 5.99484 3.12232 4.34154 4.34131 3.12256C5.56029 1.90357 7.21359 1.21875 8.9375 1.21875C10.6614 1.21875 12.3147 1.90357 13.5337 3.12256C14.7527 4.34154 15.4375 5.99484 15.4375 7.71875C15.4375 11.375 9.75 15.8438 8.9375 17.875Z"
          fill={palette.blue[600]}
        />
        <Path
          d="M17.875 23.5625C17.0625 21.5312 12.1875 17.4688 12.1875 14.2188C12.1875 12.7103 12.7867 11.2637 13.8533 10.1971C14.9199 9.13047 16.3666 8.53125 17.875 8.53125C19.3834 8.53125 20.8301 9.13047 21.8967 10.1971C22.9633 11.2637 23.5625 12.7103 23.5625 14.2188C23.5625 17.4688 18.6875 21.5312 17.875 23.5625Z"
          fill={palette.amber[600]}
          stroke={palette.blue[50]}
          strokeWidth={1.21875}
        />
      </Svg>
    );
  }
  if (mode === 'heatmap') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M10.5625 19.5a8.125 8.125 0 1 0 0-16.25 8.125 8.125 0 0 0 0 16.25Z" fill={palette.amber[200]} />
        <Path d="M10.5625 16.25a4.875 4.875 0 1 0 0-9.75 4.875 4.875 0 0 0 0 9.75Z" fill={palette.orange[400]} />
        <Path d="M10.5625 13.4875a2.1125 2.1125 0 1 0 0-4.225 2.1125 2.1125 0 0 0 0 4.225Z" fill={palette.red[600]} />
        <Path d="M19.5 22.75a4.875 4.875 0 1 0 0-9.75 4.875 4.875 0 0 0 0 9.75Z" fill={palette.amber[200]} />
        <Path d="M19.5 19.9875a2.1125 2.1125 0 1 0 0-4.225 2.1125 2.1125 0 0 0 0 4.225Z" fill={palette.orange[400]} />
      </Svg>
    );
  }
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
      <Path d="M2.4375 4.0625H12.1875L13.8125 11.375L2.4375 14.625V4.0625Z" fill={palette.blue[200]} stroke={palette.white} strokeWidth={0.975} />
      <Path d="M12.1875 4.0625H23.5625V13L13.8125 11.375L12.1875 4.0625Z" fill={palette.blue[500]} stroke={palette.white} strokeWidth={0.975} />
      <Path d="M2.4375 14.625L13.8125 11.375L23.5625 13V21.9375H2.4375V14.625Z" fill={palette.blue[700]} stroke={palette.white} strokeWidth={0.975} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Figma: 시트 위 26 에 X(44), 제목은 34 — 손잡이 영역(20) 아래 여백 6.
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: space[20], paddingRight: space[10], marginTop: space[6] },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: space[20], marginTop: 22 },
  bleed: { paddingHorizontal: 0 },
  label: { marginBottom: space[10] },
  labelBleed: { paddingHorizontal: space[20] },
  row3: { flexDirection: 'row', gap: space[8] },
  modeCard: {
    flex: 1,
    height: 84,
    borderRadius: CARD_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
  },
  modeOn: { backgroundColor: c2.bg.brandSubtle, borderWidth: 2, borderColor: c2.border.brand },
  modeOff: { borderWidth: 1.5, borderColor: c2.border.default },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  tagRow: { gap: space[8], paddingHorizontal: space[20] },
  segment: {
    height: 48,
    flexDirection: 'row',
    padding: space[4],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.muted,
  },
  segItem: { flex: 1, borderRadius: radius2.sm, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: c2.bg.brand, boxShadow: '0px 1px 1.5px rgba(37, 99, 235, 0.3)' },
  baseItem: { flex: 1, alignItems: 'center', gap: space[4] },
  thumb: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: radius2.md,
    overflow: 'hidden',
    backgroundColor: c2.bg.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 썸네일 원본(640×400)은 2배 해상도 캡처 — 반으로 줄여 가운데만 보이면 글자가 지도 화면과 같은 크기다(Figma 1-3).
  thumbImg: { width: 320, height: 200 },
  footer: { flexDirection: 'row', gap: space[8], paddingHorizontal: space[20], marginTop: space[24] },
});

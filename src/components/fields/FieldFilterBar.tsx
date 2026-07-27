import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import {
  FIELD_STATUS_VALUES,
  FIELD_STATUS_LABEL,
  type FieldStatus,
} from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { withAlpha } from '@/theme/withAlpha';

// 현장 목록 필터 — 4개 그룹(조치상태·프로젝트·카테고리·방문일)을 접이식으로 묶음.
// 평소엔 그룹명만, 탭하면 선택지가 아래로 펼쳐짐(아코디언: 한 번에 하나만).
// 각 그룹은 단일 선택. status·방문일은 서버 refresh, project·category 는 클라 필터.

type GroupKey = 'status' | 'project' | 'category' | 'date';

interface Props {
  status: FieldStatus | null;
  onStatus: (s: FieldStatus | null) => void;
  projects: ReadonlyArray<{ id: string; name: string }>;
  projectId: string | null;
  onProject: (id: string | null) => void;
  categories: readonly string[];
  category: string | null;
  onCategory: (c: string | null) => void;
  fromDate: string | null;
  toDate: string | null;
  onDateRange: (from: string | null, to: string | null) => void;
  onResetAll: () => void;
  hasFilter: boolean;
  // 방문일 그룹 노출 여부. 현장 목록은 서버 refresh 로 기간을 거르지만, 외근 시작
  // 현장 선택은 클라이언트 필터(applyFieldFilters)만 쓰므로 동작하지 않는 그룹을 숨긴다.
  showDate?: boolean;
}

// 'YYYY-MM-DD' → 'MM.DD' (헤더 요약용)
const fmtMD = (iso: string) => iso.slice(5).replace('-', '.');
// 로컬 날짜 → 'YYYY-MM-DD' (toISOString 은 UTC 로 밀려 하루 어긋날 수 있어 직접 조립)
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
const parseISO = (iso: string) => new Date(`${iso}T00:00:00`);

function dateSummary(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  return `${from ? fmtMD(from) : ''}~${to ? fmtMD(to) : ''}`;
}

export function FieldFilterBar({
  status,
  onStatus,
  projects,
  projectId,
  onProject,
  categories,
  category,
  onCategory,
  fromDate,
  toDate,
  onDateRange,
  onResetAll,
  hasFilter,
  showDate = true,
}: Props) {
  const [open, setOpen] = useState<GroupKey | null>(null);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const toggle = (k: GroupKey) => {
    setPicking(null);
    setOpen((prev) => (prev === k ? null : k));
  };

  const projectName = projectId
    ? projects.find((p) => p.id === projectId)?.name ?? '프로젝트'
    : null;

  const heads: Array<{
    key: GroupKey;
    base: string;
    value: string | null;
  }> = [
    { key: 'status', base: '조치상태', value: status ? FIELD_STATUS_LABEL[status] : null },
    { key: 'project', base: '프로젝트', value: projectName },
    { key: 'category', base: '카테고리', value: category },
    ...(showDate
      ? ([{ key: 'date', base: '방문일', value: dateSummary(fromDate, toDate) }] as const)
      : []),
  ];

  // 시작일이 종료일보다 늦으면 반대쪽을 당겨 from<=to 유지.
  // 네이티브 피커(onChange)와 웹 <input type=date> 가 공유.
  const applyPick = (which: 'from' | 'to', iso: string | null) => {
    if (iso === null) {
      onDateRange(which === 'from' ? null : fromDate, which === 'to' ? null : toDate);
      return;
    }
    if (which === 'from') {
      onDateRange(iso, toDate && toDate < iso ? iso : toDate);
    } else {
      onDateRange(fromDate && fromDate > iso ? iso : fromDate, iso);
    }
  };

  const handleDate = (event: DateTimePickerEvent, selected?: Date) => {
    setPicking(null);
    if (event.type === 'dismissed' || !selected || !picking) return;
    applyPick(picking, toISO(selected));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        {heads.map((h) => {
          const active = h.value !== null;
          const expanded = open === h.key;
          return (
            <Pressable
              key={h.key}
              onPress={() => toggle(h.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded, selected: active }}
              style={({ pressed }) => [
                styles.head,
                active && {
                  backgroundColor: withAlpha(colors.primary, 0.1),
                  borderColor: colors.primary,
                },
                expanded && styles.headExpanded,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                variant="caption"
                weight={active ? 'bold' : 'semibold'}
                color={active ? 'primary' : 'text'}
                numberOfLines={1}
              >
                {h.value ?? h.base}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={13}
                color={active ? colors.primary : colors.textMuted}
              />
            </Pressable>
          );
        })}
        {hasFilter ? (
          <Pressable
            onPress={() => {
              setOpen(null);
              setPicking(null);
              onResetAll();
            }}
            accessibilityRole="button"
            accessibilityLabel="필터 해제"
            style={({ pressed }) => [styles.reset, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {open === 'status' ? (
        <Panel>
          <OptionRow label="전체" selected={status === null} onPress={() => onStatus(null)} />
          {FIELD_STATUS_VALUES.map((s) => (
            <OptionRow
              key={s}
              label={FIELD_STATUS_LABEL[s]}
              dotColor={colors.fieldStatus[s]}
              selected={status === s}
              onPress={() => onStatus(s)}
            />
          ))}
        </Panel>
      ) : null}

      {open === 'project' ? (
        <Panel>
          <OptionRow label="전체" selected={projectId === null} onPress={() => onProject(null)} />
          {projects.length === 0 ? (
            <Text variant="caption" color="textMuted" style={styles.empty}>
              소속된 프로젝트가 없습니다
            </Text>
          ) : (
            projects.map((p) => (
              <OptionRow
                key={p.id}
                label={p.name}
                selected={projectId === p.id}
                onPress={() => onProject(p.id)}
              />
            ))
          )}
        </Panel>
      ) : null}

      {open === 'category' ? (
        <Panel>
          <OptionRow label="전체" selected={category === null} onPress={() => onCategory(null)} />
          {categories.length === 0 ? (
            <Text variant="caption" color="textMuted" style={styles.empty}>
              분류가 없습니다
            </Text>
          ) : (
            categories.map((c) => (
              <OptionRow
                key={c}
                label={c}
                selected={category === c}
                onPress={() => onCategory(c)}
              />
            ))
          )}
        </Panel>
      ) : null}

      {showDate && open === 'date' ? (
        <Panel>
          <DateRow
            label="시작일"
            value={fromDate}
            onOpen={() => setPicking('from')}
            onWebSelect={(iso) => applyPick('from', iso)}
          />
          <DateRow
            label="종료일"
            value={toDate}
            onOpen={() => setPicking('to')}
            onWebSelect={(iso) => applyPick('to', iso)}
          />
          {fromDate || toDate ? (
            <OptionRow label="전체 (기간 해제)" selected={false} onPress={() => onDateRange(null, null)} />
          ) : null}
        </Panel>
      ) : null}

      {/* 네이티브 전용 — 웹은 DateRow 내부의 <input type=date> 로 대체 */}
      {showDate && Platform.OS !== 'web' && picking ? (
        <DateTimePicker
          value={parseISO(
            (picking === 'from' ? fromDate : toDate) ?? toISO(new Date()),
          )}
          mode="date"
          display="default"
          onChange={handleDate}
        />
      ) : null}
    </View>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

function OptionRow({
  label,
  selected,
  onPress,
  dotColor,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  dotColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.optRow, pressed && { opacity: 0.6 }]}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text
        variant="body"
        weight={selected ? 'bold' : 'regular'}
        color={selected ? 'primary' : 'text'}
        style={styles.optLabel}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" size={18} color={colors.primary} />
      ) : null}
    </Pressable>
  );
}

function DateRow({
  label,
  value,
  onOpen,
  onWebSelect,
}: {
  label: string;
  value: string | null;
  onOpen: () => void; // 네이티브: OS 날짜 피커 열기
  onWebSelect: (iso: string | null) => void; // 웹: <input type=date> 값 반영
}) {
  // 웹은 브라우저 기본 날짜 input 을 그대로 노출 — 네이티브 모듈을 렌더하지 않음.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.optRow}>
        <Text variant="body" color="textMuted" style={styles.dateLabel}>
          {label}
        </Text>
        {/* react-native-web 트리 안의 순수 DOM input. RN 스타일이 아니라 CSS 객체. */}
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onWebSelect(e.target.value || null)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: fontFamily.regular,
            fontSize: fontSize.base,
            color: value ? colors.text : colors.textMuted,
            cursor: 'pointer',
          }}
        />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={({ pressed }) => [styles.optRow, pressed && { opacity: 0.6 }]}
    >
      <Text variant="body" color="textMuted" style={styles.dateLabel}>
        {label}
      </Text>
      <Text variant="body" weight={value ? 'bold' : 'regular'} color={value ? 'text' : 'textMuted'}>
        {value ?? '선택'}
      </Text>
      <Ionicons name="calendar-outline" size={16} color={colors.textMuted} style={styles.dateIcon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  headRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  head: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headExpanded: { borderColor: colors.primary },
  reset: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  optLabel: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dateLabel: { width: 56 },
  dateIcon: { marginLeft: spacing.sm },
  empty: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
});

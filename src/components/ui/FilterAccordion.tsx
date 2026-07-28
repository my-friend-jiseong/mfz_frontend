import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { withAlpha } from '@/theme/withAlpha';

// 목록 필터 공용 부품 — 현장·외근·보고서 목록이 같은 조작법을 쓰도록 한 곳에 모았다.
//
// 원래 현장 목록(FieldFilterBar)에만 있던 구조를 꺼냈다. 외근·보고서에도 필터를 붙이면서
// 그대로 복제하면 **플랫폼 분기 날짜 피커가 3벌**이 된다(네이티브 DateTimePicker /
// 웹 <input type=date>). 화면마다 다른 건 "어떤 그룹이 있는가" 뿐이라 껍데기를 공용화한다.
//
// 구성: FilterAccordion(칩 줄 + 한 번에 하나만 열리는 패널) + FilterPanel / FilterOptionRow /
//       FilterDateRange(날짜 범위 두 행 + 해제).

export interface FilterGroup {
  key: string;
  /** 값이 없을 때 칩에 보일 이름 (예: '기간') */
  base: string;
  /** 값이 있을 때 칩에 보일 요약. null 이면 미선택으로 간주해 강조하지 않는다. */
  value: string | null;
  /** 열렸을 때 패널 안에 그릴 내용 */
  render: () => React.ReactNode;
}

interface AccordionProps {
  groups: FilterGroup[];
  /** 하나라도 걸린 필터가 있으면 true — 해제(×) 버튼 노출 조건 */
  hasFilter: boolean;
  onResetAll: () => void;
}

/**
 * 접이식 필터 칩 줄. 평소엔 그룹명만, 탭하면 선택지가 아래로 펼쳐진다(한 번에 하나만).
 * 열린 그룹이 바뀌면 이전 패널은 언마운트되므로, 패널 내부 상태(날짜 피커 등)는
 * 자연스럽게 초기화된다.
 */
export function FilterAccordion({ groups, hasFilter, onResetAll }: AccordionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const openGroup = groups.find((g) => g.key === open) ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        {groups.map((g) => {
          const active = g.value !== null;
          const expanded = open === g.key;
          return (
            <Pressable
              key={g.key}
              onPress={() => setOpen((prev) => (prev === g.key ? null : g.key))}
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
                {g.value ?? g.base}
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

      {openGroup ? <FilterPanel>{openGroup.render()}</FilterPanel> : null}
    </View>
  );
}

export function FilterPanel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export function FilterOptionRow({
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
      {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

// ---- 날짜 범위 ----

/** 'YYYY-MM-DD' → 'MM.DD' (칩 요약용) */
const fmtMD = (iso: string) => iso.slice(5).replace('-', '.');
/** 로컬 날짜 → 'YYYY-MM-DD' (toISOString 은 UTC 로 밀려 하루 어긋날 수 있어 직접 조립) */
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
const parseISO = (iso: string) => new Date(`${iso}T00:00:00`);

/** 칩에 보일 기간 요약. 둘 다 없으면 null(미선택). */
export function dateRangeSummary(
  from: string | null,
  to: string | null,
): string | null {
  if (!from && !to) return null;
  return `${from ? fmtMD(from) : ''}~${to ? fmtMD(to) : ''}`;
}

export function FilterDateRange({
  fromDate,
  toDate,
  onChange,
  fromLabel = '시작일',
  toLabel = '종료일',
  clearLabel = '전체 (기간 해제)',
}: {
  fromDate: string | null;
  toDate: string | null;
  onChange: (from: string | null, to: string | null) => void;
  fromLabel?: string;
  toLabel?: string;
  clearLabel?: string;
}) {
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  // 시작일이 종료일보다 늦으면 반대쪽을 당겨 from<=to 유지.
  // 네이티브 피커(onChange)와 웹 <input type=date> 가 공유한다.
  const applyPick = (which: 'from' | 'to', iso: string | null) => {
    if (iso === null) {
      onChange(which === 'from' ? null : fromDate, which === 'to' ? null : toDate);
      return;
    }
    if (which === 'from') {
      onChange(iso, toDate && toDate < iso ? iso : toDate);
    } else {
      onChange(fromDate && fromDate > iso ? iso : fromDate, iso);
    }
  };

  const handleDate = (event: DateTimePickerEvent, selected?: Date) => {
    setPicking(null);
    if (event.type === 'dismissed' || !selected || !picking) return;
    applyPick(picking, toISO(selected));
  };

  return (
    <>
      <DateRow
        label={fromLabel}
        value={fromDate}
        onOpen={() => setPicking('from')}
        onWebSelect={(iso) => applyPick('from', iso)}
      />
      <DateRow
        label={toLabel}
        value={toDate}
        onOpen={() => setPicking('to')}
        onWebSelect={(iso) => applyPick('to', iso)}
      />
      {fromDate || toDate ? (
        <FilterOptionRow
          label={clearLabel}
          selected={false}
          onPress={() => onChange(null, null)}
        />
      ) : null}

      {/* 네이티브 전용 — 웹은 DateRow 내부의 <input type=date> 로 대체 */}
      {Platform.OS !== 'web' && picking ? (
        <DateTimePicker
          value={parseISO((picking === 'from' ? fromDate : toDate) ?? toISO(new Date()))}
          mode="date"
          display="default"
          onChange={handleDate}
        />
      ) : null}
    </>
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
  // 웹은 브라우저 기본 날짜 input 을 그대로 노출 — 네이티브 모듈을 렌더하지 않는다.
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
      <Text variant="body" color={value ? 'text' : 'textMuted'} style={styles.optLabel}>
        {value ?? '선택'}
      </Text>
      <Ionicons
        name="calendar-outline"
        size={16}
        color={colors.textMuted}
        style={styles.dateIcon}
      />
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
});

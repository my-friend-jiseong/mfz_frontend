import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { AppSheet } from '@/components/ui/AppSheet';
import { Button2 } from '@/components/ui/Button2';
import { FilterChip2 } from '@/components/ui/FilterChip2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { Icon } from '@/components/icons';
import { ALL_RANGE, RANGE_PRESETS, parseYmd, rangeBounds, toYmd, type VisitRange } from '@/utils/visitRange';
import { useToday } from '@/utils/useToday';
import { c2, radius2, space } from '@/theme/v2';

interface Props {
  open: boolean;
  onClose: () => void;
  value: VisitRange;
  onApply: (range: VisitRange) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_SIZE = 40;
const DOT_SIZE = 36;

/**
 * 1-3 '최근 방문일' 고르기 시트. 빠른 칩(전체·오늘·1주·1달·3달) + 기간 달력.
 * 달력은 직접 그린다 — 웹과 앱 모양이 같게, 의존성 없이. [적용]을 눌러야 지도에 반영된다.
 */
export function VisitRangeSheet({ open, onClose, value, onApply }: Props) {
  const [draft, setDraft] = useState<VisitRange>(value);
  // 달력에서 시작일만 누른 상태. 다음 탭이 끝날이 된다.
  const [anchor, setAnchor] = useState<string | null>(null);
  const today = useToday();
  const now = parseYmd(today);
  const [month, setMonth] = useState(() => monthOf(rangeBounds(value)?.to ?? today));

  // 닫혀 있는 동안 지금 값으로 맞춰 둔다 — 열 때 바꾸면 여는 애니메이션 도중 내용이 바뀐다(gorhom #2710).
  useEffect(() => {
    if (open) return;
    setDraft(value);
    setAnchor(null);
    setMonth(monthOf(rangeBounds(value, parseYmd(today))?.to ?? today));
  }, [open, value, today]);

  const bounds = rangeBounds(draft, now);
  const pickChip = (next: VisitRange) => {
    setDraft(next);
    setAnchor(null);
    const b = rangeBounds(next, now);
    if (b) setMonth(monthOf(b.to));
  };
  const pickDay = (ymd: string) => {
    if (anchor == null) {
      setAnchor(ymd);
      setDraft({ kind: 'custom', from: ymd, to: ymd });
      AccessibilityInfo.announceForAccessibility('끝날을 골라 주세요');
      return;
    }
    setDraft(anchor <= ymd ? { kind: 'custom', from: anchor, to: ymd } : { kind: 'custom', from: ymd, to: anchor });
    setAnchor(null);
  };

  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const thisMonth = monthOf(today);
  const atLatest = month.y === thisMonth.y && month.m === thisMonth.m;
  const shiftMonth = (n: number) => {
    const d = new Date(month.y, month.m + n, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <AppSheet open={open} onClose={onClose} title="최근 방문일" scrollable topRadius={radius2['3xl']}>
      <View style={styles.chips}>
        <FilterChip2 size="M" label="전체" selected={draft.kind === 'all'} onPress={() => pickChip(ALL_RANGE)} />
        {RANGE_PRESETS.map((p) => (
          <FilterChip2
            key={p.days}
            size="M"
            label={p.chip}
            selected={draft.kind === 'preset' && draft.days === p.days}
            onPress={() => pickChip({ kind: 'preset', days: p.days })}
          />
        ))}
      </View>

      <View style={styles.cal}>
        <View style={styles.monthRow}>
          <Touchable onPress={() => shiftMonth(-1)} accessibilityRole="button" accessibilityLabel="이전 달" style={styles.arrow}>
            <Icon name="chevron-right" size={20} color={c2.text.primary} style={styles.flip} />
          </Touchable>
          <Text v2="bodyL.bold" style={styles.monthText} accessibilityRole="header">
            {`${month.y}년 ${month.m + 1}월`}
          </Text>
          <Touchable
            onPress={() => shiftMonth(1)}
            disabled={atLatest}
            accessibilityRole="button"
            accessibilityLabel="다음 달"
            accessibilityState={{ disabled: atLatest }}
            style={styles.arrow}
          >
            <Icon name="chevron-right" size={20} color={atLatest ? c2.text.disabled : c2.text.primary} />
          </Touchable>
        </View>

        <View style={styles.week}>
          {WEEKDAYS.map((w) => (
            <View key={w} style={styles.weekdayCell}>
              <Text v2="caption.semibold" tone="tertiary">
                {w}
              </Text>
            </View>
          ))}
        </View>

        {weeks.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((ymd, j) => {
              if (!ymd) return <View key={j} style={styles.cell} />;
              const future = ymd > today;
              const isFrom = !!bounds && ymd === bounds.from;
              const isTo = !!bounds && ymd === bounds.to;
              const inside = !!bounds && ymd >= bounds.from && ymd <= bounds.to;
              const end = isFrom || isTo;
              const date = parseYmd(ymd);
              const day = date.getDate();
              const role = isFrom && isTo ? ', 시작일, 종료일' : isFrom ? ', 시작일' : isTo ? ', 종료일' : '';
              const a11y = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${day}일 ${WEEKDAYS[date.getDay()]}요일${ymd === today ? ', 오늘' : ''}${role}`;
              return (
                <Touchable
                  key={j}
                  onPress={() => pickDay(ymd)}
                  disabled={future}
                  noAutoHitSlop
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityState={{ disabled: future, selected: inside }}
                  style={styles.cell}
                >
                  {inside && !(isFrom && isTo) ? (
                    <View style={[styles.band, isFrom && styles.bandFrom, isTo && styles.bandTo]} />
                  ) : null}
                  <View style={[styles.dot, end && styles.dotOn]}>
                    <Text
                      v2={end || ymd === today ? 'bodyM.bold' : 'bodyM.semibold'}
                      tone={end ? 'inverse' : future ? 'disabled' : ymd === today ? 'brand' : 'primary'}
                    >
                      {day}
                    </Text>
                  </View>
                </Touchable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Button2 variant="secondary" onPress={() => pickChip(ALL_RANGE)}>
          초기화
        </Button2>
        <Button2 onPress={() => onApply(draft)} style={styles.flex}>
          적용
        </Button2>
      </View>
    </AppSheet>
  );
}

function monthOf(ymd: string) {
  const d = parseYmd(ymd);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/** 일요일 시작 주 단위 칸. 그 달이 아닌 칸은 null. 늘 6주(42칸) — 달을 넘겨도 시트 높이가 그대로이게. */
function monthGrid(y: number, m: number): (string | null)[][] {
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(toYmd(new Date(y, m, d)));
  while (cells.length < 42) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8], paddingHorizontal: space[20], marginTop: space[8] },
  cal: { paddingHorizontal: space[16], marginTop: space[20] },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space[8] },
  monthText: { flex: 1, textAlign: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ scaleX: -1 }] },
  week: { flexDirection: 'row' },
  weekdayCell: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1, height: DAY_SIZE + space[4], alignItems: 'center', justifyContent: 'center' },
  // 범위 띠 — 칸 전체 폭, 양 끝 날은 안쪽 절반만.
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (DAY_SIZE + space[4] - DOT_SIZE) / 2,
    height: DOT_SIZE,
    backgroundColor: c2.bg.brandSubtle,
  },
  bandFrom: { left: '50%' },
  bandTo: { right: '50%' },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: c2.bg.brand },
  footer: { flexDirection: 'row', gap: space[8], paddingHorizontal: space[20], marginTop: space[20] },
});

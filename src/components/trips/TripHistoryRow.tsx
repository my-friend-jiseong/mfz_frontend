import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import type { Trip } from '@/types/entities';
import type { ReportStage } from '@/utils/reportStatus';
import { dayOfMonth, fmtTripSummary, tripTitle, weekdayKo } from '@/utils/tripFormat';
import { c2, radius2, space } from '@/theme/v2';

interface Props {
  trip: Trip;
  visitCount: number;
  stage: ReportStage;
  /** 위 행과 구분선(묶음의 첫 행은 없음). */
  divider: boolean;
  onPress: (tripId: string) => void;
  /** 작성 전의 [보고서 작성]. */
  onWriteReport: (tripId: string) => void;
}

/**
 * 외근 내역 한 줄(Figma 1·2 Row): 요일·날짜 | 제목·'방문 N건 · 시간' | 보고서 상태.
 * 보고서 상태(인수인계 '용어·문구 규칙'): ✓ 작성 완료(초록) · ✎ 작성 중(파랑) · 작성 전은 [보고서 작성] 버튼.
 */
export const TripHistoryRow = memo(function TripHistoryRow({ trip, visitCount, stage, divider, onPress, onWriteReport }: Props) {
  const title = tripTitle(trip);
  // 방문 0곳 외근은 보고서를 만들 수 없다(3-3). 상태를 모르는 동안(checking)도 버튼을 두지 않는다 —
  // 보고서가 있는데 작성 전으로 보이면 같은 외근에 보고서를 또 만든다.
  const canWrite = stage === 'none' && visitCount > 0;
  const stageLabel = stage === 'draft' ? '보고서 작성 중' : stage === 'done' ? '보고서 작성 완료' : '';
  return (
    // 행 전체(상태 표시 포함)가 외근 상세로 가는 버튼. [보고서 작성]만 따로 누른다.
    <Touchable
      onPress={() => onPress(trip.id)}
      accessibilityRole="button"
      accessibilityLabel={[title, fmtTripSummary(visitCount, trip), stageLabel].filter(Boolean).join(', ')}
      pressedOpacity={0.6}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.date}>
        <Text v2="small.semibold" tone="tertiary">
          {weekdayKo(trip.startedAt)}
        </Text>
        <Text v2="title.l" numeric>
          {dayOfMonth(trip.startedAt)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text v2="bodyL.semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
          {fmtTripSummary(visitCount, trip)}
        </Text>
      </View>
      {canWrite ? (
        <Touchable
          onPress={() => onWriteReport(trip.id)}
          accessibilityRole="button"
          accessibilityLabel={`${title} 보고서 작성`}
          style={styles.write}
        >
          <Text v2="caption.bold" tone="link">
            보고서 작성
          </Text>
        </Touchable>
      ) : stage === 'draft' ? (
        <View style={styles.stage}>
          <Icon name="edit" size={14} color={c2.text.link} />
          <Text v2="caption.semibold" tone="link">
            작성 중
          </Text>
        </View>
      ) : stage === 'done' ? (
        <View style={styles.stage}>
          <Icon name="check" size={14} color={c2.text.success} />
          <Text v2="caption.semibold" tone="success">
            작성 완료
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: { height: 72, flexDirection: 'row', alignItems: 'center', gap: space[14], marginHorizontal: space[20] },
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  date: { width: 44, alignItems: 'center' },
  body: { flex: 1, gap: space[2] },
  write: {
    height: 36,
    paddingHorizontal: space[12],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.brandSubtle,
    justifyContent: 'center',
  },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});

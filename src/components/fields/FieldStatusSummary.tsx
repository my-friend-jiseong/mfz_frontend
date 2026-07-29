import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { FIELD_STATUS_LABEL, FIELD_STATUS_VALUES } from '@/types/entities';
import type { FieldStatus } from '@/types/entities';

interface Props {
  counts: Record<FieldStatus, number>;
}

// 현장 탭의 focal (강령 1·8).
//
// 이 화면에서 답해야 할 질문은 "내가 맡은 현장 중 아직 손 안 댄 게 몇 곳이냐" 다.
// 그래서 조치 전 건수 하나만 크게 두고, 나머지는 분포 막대와 캡션으로 맥락만 준다.
//
// 외근 탭의 3열 metric 행을 그대로 반복하지 않는다 — 화면마다 같은 표현을 쓰면
// 그 자체가 '아무도 결정하지 않았다' 는 신호다. 여기 질문은 "얼마나 했나"(집계)가
// 아니라 "얼마나 남았나"(잔량)이라 분포가 맞는 형태다.
export function FieldStatusSummary({ counts }: Props) {
  const total = FIELD_STATUS_VALUES.reduce((n, s) => n + counts[s], 0);
  if (total === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.focal}>
          <Text variant="caption" weight="semibold" color="textMuted">
            {FIELD_STATUS_LABEL.pending}
          </Text>
          <Text variant="metric" color="warning" numeric>
            {counts.pending}
          </Text>
        </View>
        <View style={styles.rest}>
          {FIELD_STATUS_VALUES.filter((s) => s !== 'pending').map((s) => (
            <View key={s} style={styles.restItem}>
              <View style={[styles.dot, { backgroundColor: colors.fieldStatus[s] }]} />
              <Text variant="caption" color="textMuted" numeric>
                {FIELD_STATUS_LABEL[s]} {counts[s]}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {/* 분포 막대 — 색 단독 정보 전달이 아니다. 바로 위 캡션이 라벨+숫자를 준다. */}
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no">
        {FIELD_STATUS_VALUES.map((s) =>
          counts[s] > 0 ? (
            <View
              key={s}
              style={{
                flexGrow: counts[s],
                backgroundColor: colors.fieldStatus[s],
              }}
            />
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  // 정렬 기준은 라벨 줄(위) — 바닥을 맞추면 크기가 작은 쪽 라벨이 내려앉는다.
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  focal: { gap: spacing.xs },
  rest: { gap: spacing.xs, paddingTop: spacing.xs },
  restItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  track: {
    flexDirection: 'row',
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
});

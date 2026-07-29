import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

interface Props {
  startedAtLabel: string | null;
  arrived: number;
  skipped: number;
  total: number;
  ratio: number;
}

// 진행 중 외근의 진행률 — 한 줄 스트립.
//
// 이전엔 Card 안에 경과시간/카운트/8dp 바가 3단으로 쌓여 ~82dp 를 썼는데(당시 이름
// TripSummaryCard), 그만큼 현재 목적지 카드가 아래로 밀려 시트를 55%(지도 확보)로 낮추면
// 잘렸다. 정보량은 그대로 두고 높이만 접었다 — 경과·카운트를 한 행에, 바는 3dp.
export function TripProgressStrip({
  startedAtLabel,
  arrived,
  skipped,
  total,
  ratio,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {startedAtLabel ? (
          <View style={styles.elapsed}>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" weight="semibold" color="textMuted" numberOfLines={1}>
              {startedAtLabel}
            </Text>
          </View>
        ) : (
          <View style={styles.elapsed} />
        )}
        <Text variant="caption" weight="semibold" color="textMuted" numeric>
          방문 {arrived}
          {skipped > 0 ? ` · 건너뜀 ${skipped}` : ''} / {total}곳
        </Text>
        {/* 이 화면의 focal 은 아래 현재 목적지 카드다 — 진행률은 맥락이라 키우지 않는다.
            1 화면 = 1 결정(강령 1). 대신 tabular 로 방문 수가 바뀔 때 폭이 안 흔들리게. */}
        <Text variant="caption" weight="heavy" color="primary" numeric>
          {ratio}%
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // 경과 라벨만 남는 공간을 차지 — 카운트·% 는 오른쪽에 붙는다.
  elapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  track: {
    height: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
});

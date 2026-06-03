import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { withAlpha } from '@/theme/withAlpha';
import { choroplethLegend, CHOROPLETH_COLOR } from '@/theme/choroplethScale';
import type { DisplayMode } from '@/components/MapFilterBar';

// 지도 좌하단 범례 — 히트맵·단계구분도의 색을 정량(건수/밀도)으로 읽게 한다.
// 마커 모드는 마커 자체에 형상·라벨이 있어 범례 불필요(null).
const HEATMAP_COLOR = colors.danger; // #dc2626 — renderHeatmap Circle fillColor 와 동일
const HEATMAP_STEPS = [0.14, 0.28, 0.42, 0.56]; // 밀도 체감 척도(겹칠수록 진해짐) 근사

// bottomInset: 지도 위에 깔리는 바텀시트 peek 높이 — 범례가 시트에 가리지 않도록 그만큼 띄운다.
export function MapLegend({
  displayMode,
  bottomInset = 0,
}: {
  displayMode: DisplayMode;
  bottomInset?: number;
}) {
  if (displayMode === 'markers') return null;
  const cardStyle = [styles.card, { bottom: bottomInset + spacing.md }];

  if (displayMode === 'heatmap') {
    return (
      <View style={cardStyle}>
        <Text variant="caption" weight="bold" color="textMuted" style={styles.title}>
          현장 밀집도
        </Text>
        <View style={styles.heatBar}>
          {HEATMAP_STEPS.map((op, i) => (
            <View
              key={i}
              style={[styles.heatCell, { backgroundColor: withAlpha(HEATMAP_COLOR, op) }]}
            />
          ))}
        </View>
        <View style={styles.heatScaleRow}>
          <Text variant="caption" color="textSubtle">
            낮음
          </Text>
          <Text variant="caption" color="textSubtle">
            높음
          </Text>
        </View>
      </View>
    );
  }

  // choropleth
  const items = choroplethLegend();
  return (
    <View style={cardStyle}>
      <Text variant="caption" weight="bold" color="textMuted" style={styles.title}>
        시/군/구 현장 수
      </Text>
      {items.map((item) => (
        <View key={item.label} style={styles.row}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: withAlpha(CHOROPLETH_COLOR, item.opacity) },
            ]}
          />
          <Text variant="caption" color="text">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...elevation.card,
  },
  title: { marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: withAlpha(CHOROPLETH_COLOR, 0.5),
  },
  heatBar: {
    flexDirection: 'row',
    width: 120,
    height: 12,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  heatCell: { flex: 1, height: '100%' },
  heatScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    width: 120,
  },
});

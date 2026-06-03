import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { elevation } from '@/theme/elevation';
import { withAlpha } from '@/theme/withAlpha';
import { choroplethLegend, CHOROPLETH_COLOR } from '@/theme/choroplethScale';
import { heatLegendCells, HEAT_MAX } from '@/theme/heatScale';
import type { DisplayMode } from '@/components/MapFilterBar';

// 지도 좌하단 범례 — 히트맵·단계구분도의 색을 정량(건수/밀도)으로 읽게 한다.
// 마커 모드는 마커 자체에 형상·라벨이 있어 범례 불필요(null).
// 히트맵 바는 실제 렌더(heatmap.js)와 동일한 gradient 를 보간 샘플해 그린다 — 근사 단색 척도 폐기.
const HEAT_CELLS = heatLegendCells(24);

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
          {HEAT_CELLS.map((color, i) => (
            <View key={i} style={[styles.heatCell, { backgroundColor: color }]} />
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
        <Text variant="caption" color="textSubtle" style={styles.heatHint}>
          현장 약 {HEAT_MAX}건 겹치면 최고 농도
        </Text>
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
  heatHint: { marginTop: 4, width: 120 },
});

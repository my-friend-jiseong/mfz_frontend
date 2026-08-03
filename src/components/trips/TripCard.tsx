import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDayLabel, fmtDuration, fmtTime } from '@/utils/datetime';
import type { Trip } from '@/types/entities';

interface Props {
  trip: Trip;
  title: string;
  // 이 외근의 방문 건수. 로컬 visitStore 우선, 없으면 list API 의 visitCount 폴백 —
  // 계산 주체는 목록 화면(회로 주석은 trips/index.tsx 참고).
  visitCount: number;
  // 계획 목적지 수(Trip.destinationCount). 없으면 null → 진행률 바 대신 방문 건수만 노출.
  plannedCount: number | null;
  hasReport: boolean;
  // 콜백은 trip.id 를 받는다 — 목록이 useCallback 으로 한 번만 만들어 넘길 수 있어야
  // 아래 memo 가 실제로 걸린다(카드마다 새 클로저를 넘기면 memo 는 매번 미스).
  onPress: (tripId: string) => void;
  // 배경 지도를 이 외근의 현장으로 좁힌다(재탭 시 해제). 미지정이면 버튼을 그리지 않는다.
  onFocusMap?: (tripId: string) => void;
  // 이 외근이 현재 지도에 표시 중인지 — 버튼이 토글이라 상태를 보여줘야 한다.
  mapFocused?: boolean;
  // 상세 페치 중 — 목록엔 목적지가 없어서 '지도에서 보기' 는 단건 loadDetail 을 먼저 돈다.
  mapLoading?: boolean;
}

// 외근 목록 카드. FieldCard 와 같은 위계(상태 칩 → 제목 → 메타 → 보조 지표)를 따르되
// 외근의 진짜 질문 — "끝났나 / 얼마나 돌았나 / 보고서까지 갔나" — 에 답하도록 구성.
//
// 부모가 검색어 입력마다 재렌더되므로 props 비교 memo (DestinationRow 와 동일 이유).
// 콜백을 id 인자 방식으로 둔 것도 이 memo 를 살리기 위한 것 — Props 주석 참고.
export const TripCard = memo(function TripCard({
  trip,
  title,
  visitCount,
  plannedCount,
  hasReport,
  onPress,
  onFocusMap,
  mapFocused,
  mapLoading,
}: Props) {
  // 종료 시각이 없는 외근 = 종료 처리가 안 된 기록. 진행 중인 외근은 목록에 오지 않는다
  // (trips/index.tsx 가 activeTripId 있으면 active 화면으로 통째 redirect).
  const ended = !!trip.endedAt;

  // 분모가 방문 수보다 작으면 그 값은 믿을 수 없다 — "방문 3 / 계획 1곳" 같은 말이 안 되는
  // 문구가 나오므로 분모를 버리고 "방문 N건" 으로 폴백한다. 0 나눗셈·"5/0곳" 도 같은 가드다.
  //
  // ⚠️ 이 가드는 원래 **틀린 필드를 읽고 있어서** 사실상 항상 발동했다(2026-08-03 정정).
  // 목록엔 destinations 가 없어 서버 카운트에 의존하는데, 그동안 `siteCount` 를 계획 수로
  // 읽었다. 그건 실제로 **들른** 현장 수(distinct visit.fieldId)라 정의상 방문 수 이하 —
  // 즉 분모가 항상 분자 이하여서 진행률 바가 한 번도 그려지지 않았다. 계획 수는 §26 으로
  // 신설된 `destinationCount` 다. 가드 자체는 남긴다 — 구 백엔드 응답·미계획 외근에 여전히
  // 필요하고, 이제는 '항상' 이 아니라 '진짜 이상할 때만' 발동한다.
  const planned =
    plannedCount != null && plannedCount > 0 && plannedCount >= visitCount
      ? plannedCount
      : null;
  const ratio = planned ? Math.round((visitCount / planned) * 100) : null;

  return (
    <Card
      onPress={() => onPress(trip.id)}
      padding="md"
      style={styles.card}
      accessibilityLabel={`${title}, ${ended ? '완료' : '미종료'}, 방문 ${visitCount}건${
        hasReport ? ', 보고서 있음' : ''
      }`}
    >
      <View style={styles.topRow}>
        <View style={styles.chips}>
          {/* 색 단독 금지 — 색 + 형상 + 라벨 3중 인코딩 (colors.ts 도메인 status 규칙). */}
          <Badge
            label={ended ? '완료' : '미종료'}
            tone={ended ? 'success' : 'warning'}
            shape={ended ? 'square' : 'triangle'}
          />
          {/* 보고서 없음은 배지를 그리지 않는다 — 부정 상태까지 칠하면 목록이 배지밭이 된다. */}
          {hasReport ? <Badge label="보고서" tone="info" shape="diamond" /> : null}
        </View>
        <Text variant="caption" weight="semibold" color="textMuted">
          {fmtDayLabel(trip.startedAt)}
        </Text>
      </View>

      <Text variant="body" weight="bold" numberOfLines={1} style={styles.title}>
        {title}
      </Text>

      <Text variant="caption" color="textMuted" style={styles.meta}>
        {fmtTime(trip.startedAt)} 시작 · {fmtDuration(trip.startedAt, trip.endedAt)}
      </Text>

      <View style={styles.progressRow}>
        {ratio !== null ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${ratio}%` }]} />
          </View>
        ) : (
          <View style={styles.trackSpacer} />
        )}
        {/* 목록 카드의 숫자는 키우지 않는다 — 카드마다 큰 숫자가 있으면 목록에
            focal 이 N 개가 되어 아무것도 focal 이 아니게 된다. tabular 만 적용. */}
        <Text variant="caption" weight="semibold" color="textMuted" numeric>
          {ratio !== null
            ? `방문 ${visitCount} / 계획 ${planned}곳`
            : `방문 ${visitCount}건`}
        </Text>
        {onFocusMap ? (
          <Pressable
            onPress={(e) => {
              // 카드(Card) Pressable 안의 Pressable — 네이티브는 responder 협상으로 안쪽만
              // 잡지만 웹(RNW)에선 DOM 이벤트가 위로 타고 올라가 카드 onPress(상세 이동)까지
              // 함께 터질 수 있다. 지도 토글만 일어나도록 전파를 끊는다.
              e.stopPropagation?.();
              onFocusMap(trip.id);
            }}
            disabled={mapLoading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: !!mapFocused }}
            accessibilityLabel={
              mapFocused ? '지도 표시 해제' : '이 외근을 지도에서 보기'
            }
            style={({ pressed }) => [
              styles.mapBtn,
              mapFocused && styles.mapBtnActive,
              pressed && { opacity: opacity.pressed },
            ]}
          >
            {mapLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={mapFocused ? 'map' : 'map-outline'}
                size={16}
                color={mapFocused ? colors.primary : colors.textMuted}
              />
            )}
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', gap: spacing.xs, flexShrink: 1 },
  title: { marginTop: spacing.sm },
  meta: { marginTop: 2 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  trackSpacer: { flex: 1 },
  mapBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  mapBtnActive: {
    backgroundColor: colors.primaryMuted,
  },
  track: {
    flex: 1,
    height: 4,
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

import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { opacity } from '@/theme/motion';

interface Props {
  order: number;
  // 상대 번호 — "전체 K곳 중 M번째 처리" 라는 위치감. order(절대) 와 분리해
  // 일부 destination 을 건너뛰었을 때 사용자가 "3번째" 가 갑자기 떠 혼란하는 회로 차단.
  positionLabel?: string;     // 예: "5곳 중 3번째"
  address: string;
  addressDetail?: string;
  onNavigate: () => void;
  onCheckIn: () => void;
  onSkip: () => void;
  onShowField?: () => void;   // 현장 상세 진입 — '도착 전 이 현장이 어떤 곳인지' 확인용
  onReoptimize?: () => void;
  optimizing?: boolean;
  pendingCount?: number;
}

// 액션 배치는 실사용 순서를 그대로 따른다 — 찾아간다(길찾기) → 도착해서 기록한다(체크인).
//
// 이전엔 체크인만 풀폭 버튼이고 길찾기·재최적화·건너뛰기가 22dp 아이콘 3분할 타일이었다.
// 이동 중 가장 자주 누르는 길찾기가 가장 작게 눌려 있던 셈이라, 길찾기를 본문 버튼으로
// 올려 체크인과 나란히 두고 보조 동작(재최적화·건너뛰기)만 작은 텍스트 행으로 내렸다.
//
// 도착 여부를 자동으로 감지해 primary 를 바꾸는 방식은 위치 추적(watch)이 필요해 이번 범위 밖 —
// 고정 배치로 두되 순서로 맥락을 준다.
export function CurrentDestCard({
  order,
  positionLabel,
  address,
  addressDetail,
  onNavigate,
  onCheckIn,
  onSkip,
  onShowField,
  onReoptimize,
  optimizing,
  pendingCount,
}: Props) {
  const showReop = onReoptimize && (pendingCount ?? 0) >= 2;
  return (
    <Card padding="md" style={styles.card}>
      {/* 보조 액션을 캡션과 같은 행에 올린다 — 별도 행으로 두면 카드가 191dp 가 되어
          55% 시트에서 하단 고정 바가 길찾기·체크인을 덮었다(실측). 재최적화는 아이콘만
          (드물게 쓰는 동작, accessibilityLabel 로 보완), 건너뛰기는 라벨 유지. */}
      <View style={styles.capRow}>
        <Text variant="caption" weight="bold" color="primary" numberOfLines={1} style={styles.cap}>
          현재 목적지 · {positionLabel ?? `${order}번째`}
        </Text>
        {showReop ? (
          <Button
            onPress={onReoptimize}
            variant="ghost"
            size="sm"
            leftIcon={optimizing ? 'hourglass-outline' : 'sparkles'}
            loading={optimizing}
            accessibilityLabel="남은 목적지 순서 다시 최적화"
          >
            {''}
          </Button>
        ) : null}
        <Button
          onPress={onSkip}
          variant="dangerGhost"
          size="sm"
          leftIcon="play-skip-forward"
        >
          건너뛰기
        </Button>
      </View>
      {onShowField ? (
        <Pressable
          onPress={onShowField}
          accessibilityRole="button"
          accessibilityLabel="현장 상세 보기"
          style={({ pressed }) => [
            styles.titleRow,
            pressed && { opacity: opacity.pressed },
          ]}
        >
          <Text variant="h3" style={styles.titleText}>
            {address}
          </Text>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.primary}
          />
        </Pressable>
      ) : (
        <Text variant="h3">{address}</Text>
      )}
      {addressDetail ? <Text variant="bodySm">{addressDetail}</Text> : null}

      <View style={styles.mainRow}>
        <Button
          onPress={onNavigate}
          variant="secondary"
          size="md"
          leftIcon="navigate"
          style={styles.mainBtn}
        >
          길찾기
        </Button>
        <Button
          onPress={onCheckIn}
          size="md"
          leftIcon="checkmark-circle"
          style={styles.mainBtn}
        >
          체크인
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: { flex: 1 },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cap: { flex: 1 },
  mainRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mainBtn: { flex: 1 },
});

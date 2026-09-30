import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

interface Props {
  // 상대 번호 — "전체 K곳 중 M번째 처리" 라는 위치감. 일부를 건너뛰었을 때
  // 절대 order 가 "3번째" 로 갑자기 뛰어 혼란스러운 것을 막는다.
  positionLabel: string; // 예: "5곳 중 3번째"
  address: string;
  addressDetail?: string;
  onNavigate: () => void;
  onCheckIn: () => void;
}

// 진행 중 외근의 현재 목적지 (명세 v2 FE-OUT-04).
// 주 CTA 는 길찾기·체크인 둘뿐이다 — 건너뛰기·재최적화·현장 추가는 헤더 `···` 시트로 옮겼다
// (수락 기준 1: 첫 화면에 예외 액션을 상시 노출하지 않는다).
// 배치는 실사용 순서를 따른다 — 찾아간다(길찾기) → 도착해서 기록한다(체크인).
export function CurrentDestCard({
  positionLabel,
  address,
  addressDetail,
  onNavigate,
  onCheckIn,
}: Props) {
  const detail = fieldDetailLine({ address, addressDetail });
  return (
    <Card padding="md" style={styles.card}>
      <Text variant="caption" weight="bold" color="primary" numberOfLines={1}>
        현재 목적지 · {positionLabel}
      </Text>
      <Text variant="h3">{address}</Text>
      {/* 주소가 이미 상세주소로 끝나면 중복이다 (fieldFacets 규칙). */}
      {detail ? <Text variant="bodySm">{detail}</Text> : null}

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
        <Button onPress={onCheckIn} size="md" leftIcon="checkmark-circle" style={styles.mainBtn}>
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
  mainRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mainBtn: { flex: 1 },
});

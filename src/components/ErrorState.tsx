import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// EmptyState 의 형제. 둘을 절대 같은 화면으로 처리하지 않기 위해 별도 컴포넌트로 둔다 —
// 조회 실패를 empty 로 렌더하면 사용자가 '서버 오류' 를 '데이터 없음' 으로 오독한다
// (야외 LTE 환경에서 가장 자주 나는 실패이고, 오독 시 배정이 없다고 판단해 돌아간다).
//
// 색: danger(빨강)를 쓰지 않는다. '빨강 = 파괴적 액션 전용' 규칙(colors.ts 105, Button.tsx 71)
// 은 액션에 대한 것이고, amber 는 이미 '조치 전' 상태가 점유했다. 조회 실패는 상태이므로
// 색을 새로 끌어오는 대신 형상(아이콘) + 라벨 + 재시도 액션으로 구분한다 (강령 2 의 3중 인코딩).
interface Props {
  // localizeError(e) 결과. NetworkError / ApiError 가 이미 한국어로 구분되어 들어온다.
  message?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({ message, onRetry, retrying = false }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textSubtle} />
      </View>
      <Text variant="body" weight="semibold" align="center" style={styles.title}>
        불러오지 못했습니다
      </Text>
      <Text variant="bodySm" color="textMuted" align="center">
        {message || '잠시 후 다시 시도해주세요'}
      </Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button onPress={onRetry} variant="secondary" leftIcon="refresh" loading={retrying}>
            다시 시도
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { marginBottom: spacing.xs },
  action: { marginTop: spacing.lg },
});

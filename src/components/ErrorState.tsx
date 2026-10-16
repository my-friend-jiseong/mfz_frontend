import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { c2, radius2, space } from '@/theme/v2';

// 조회 실패. 빈 목록과 같은 모양으로 그리지 않는다 — 조회 실패를 '데이터 없음'으로 오독하면
// (야외 LTE 에서 가장 흔한 실패) 배정이 없다고 판단해 돌아간다. 빨강은 파괴적 동작 전용이라 쓰지 않고
// 아이콘 + 글 + [다시 시도]로 구분한다.
interface Props {
  // localizeError(e) 결과. NetworkError / ApiError 가 이미 한국어로 구분되어 들어온다.
  message?: string | null;
  onRetry?: () => void;
}

// 재시도 중 스피너는 두지 않는다 — 재시도하면 listStatus 가 'loading' 으로 바뀌어 이 컴포넌트가 바로 사라진다.
export function ErrorState({ message, onRetry }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Icon name="cloud-off" size={28} color={c2.text.tertiary} />
      </View>
      <Text v2="bodyM.bold" style={styles.center}>
        불러오지 못했어요
      </Text>
      <Text v2="bodyS.regular" tone="tertiary" style={[styles.center, styles.message]}>
        {message || '잠시 뒤에 다시 해 주세요.'}
      </Text>
      {onRetry ? (
        <Button2 variant="secondary" size="M" onPress={onRetry} style={styles.action}>
          다시 시도
        </Button2>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space[24], alignItems: 'center', justifyContent: 'center' },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[12],
  },
  center: { textAlign: 'center' },
  message: { marginTop: space[4] },
  action: { marginTop: space[16] },
});

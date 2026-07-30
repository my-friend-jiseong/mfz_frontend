import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { Text } from './Text';
import { spacing } from '@/theme/spacing';

// 화면 섹션 머리말 — caption + bold + muted + uppercase + letterSpacing.
// 내 정보 탭의 3 화면이 이 5 줄을 손으로 반복하다 profile/edit 한 곳만 marginTop 이
// lg 로 어긋나 있었다(같은 머리말이 화면마다 다른 높이에 뜬다). 리듬을 컴포넌트가 갖는다.
//
// 기본 marginTop 은 '그룹 ↔ 그룹'(xl). 영역 경계(xxl)나 화면 첫 줄(0)처럼 리듬이
// 다른 자리는 style 로 덮는다 — prop 을 늘리는 대신 2.1절 tier 를 callsite 에서 고른다.
//
// 지도 부유물 안의 위젯 제목(MapLegend·MapFilterBar)은 같은 Text 조합이지만 margin 이
// 없고 uppercase 도 아니다 — 다른 패턴이라 여기로 흡수하지 않는다.
export function GroupLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text variant="caption" weight="bold" color="textMuted" style={[styles.label, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

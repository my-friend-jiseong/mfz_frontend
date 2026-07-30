import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { spacing } from '@/theme/spacing';

// 폼 컨트롤 위의 라벨 줄 — 오른쪽에 글자수 같은 보조 값을 둘 수 있다.
//
// 세 화면(`fields/[id]/edit` · `reports/[id]/edit` · `trips/[id]/edit`)이 같은 5 줄을
// 복사해 갖고 있었고, **marginTop 이 md / lg / xl 로 셋 다 달랐다**(2026-07-30 실측).
// 같은 요소가 화면마다 다른 높이에 뜬다 — GroupLabel 을 뽑았을 때와 같은 종류의 표류다.
//
// 기본 리듬은 '카드 내부 블록 사이'(md) — 폼에서 라벨+컨트롤 한 쌍은 하나의 블록이고,
// 블록 사이가 md 다(2.1절). 화면 첫 줄처럼 리듬이 다른 자리는 style 로 marginTop 을 덮는다.
//
// 굵기는 semibold — 앱의 다수파다(`fields/new` 3곳 · `fields/[id]/edit` 3곳 ·
// `trips/[id]/edit` 1곳이 semibold, `reports/[id]/edit` 하나만 bold 였다).
//
// `GroupLabel`(caption+bold+muted+**uppercase** 눈썹)과는 다른 층이다 — 이건 컨트롤에
// 직접 붙는 라벨이라 본문 크기(bodySm)를 쓴다. 둘을 하나로 합칠지는 14절 미결.
export function FieldLabel({
  children,
  counter,
  trailing,
  style,
}: {
  children: React.ReactNode;
  /** 오른쪽 글자수 (예: "12 / 100"). 스타일을 컴포넌트가 갖는다. */
  counter?: string;
  /** 글자수 대신 임의 요소(되돌리기 버튼 등). counter 와 함께 쓰지 않는다. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <Text variant="bodySm" weight="semibold" color="textMuted" style={styles.label}>
        {children}
      </Text>
      {counter ? (
        <Text variant="caption" weight="semibold" color="textMuted" numeric>
          {counter}
        </Text>
      ) : (
        trailing ?? null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 라벨이 길어지면 오른쪽 값이 밀려나지 않게 라벨만 줄인다.
  label: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
});

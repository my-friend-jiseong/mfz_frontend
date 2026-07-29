import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { FIELD_STATUS_LABEL, type Field } from '@/types/entities';
import { fieldTitle } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { FIELD_STATUS_BADGE } from '@/theme/statusBadge';

interface Props {
  field: Field;
  onPress?: () => void;
  // 선택 모드(외근 시작 현장 선택) — brand 테두리+배경으로 선택 상태를 표시.
  selected?: boolean;
  // 좌측 체크박스 노출. selected 와 함께 쓰면 목록이 체크리스트로 동작한다.
  showCheckbox?: boolean;
}

// 현장 목록 카드.
//
// 위계: 상태(좌측 레일 + 배지) → 제목 → 주소 → 메타.
// 이전엔 상태 칩이 제목 위 **한 줄을 통째로** 차지해서, 목록을 훑을 때 눈이 매 카드마다
// 칩 줄을 한 번 읽고 제목으로 내려가야 했다. 칩을 제목 행 오른쪽으로 올리고 상태 색을
// 카드 좌측 3dp 레일로 빼서, 한 줄을 줄이면서 상태는 오히려 멀리서도 스캔된다
// (Direction '야외 계측기' 의 거부 기본값 ① — 흰 카드 균일 나열).
//
// 상태 표기는 statusBadge.ts 단일 출처를 쓴다 — 이전엔 이 파일에 ●▲■ 맵과
// withAlpha 칩이 따로 있어 3중 인코딩 규칙의 두 번째 구현이었다.
export function FieldCard({ field, onPress, selected, showCheckbox }: Props) {
  const statusColor = colors.fieldStatus[field.status];
  const badge = FIELD_STATUS_BADGE[field.status];
  const hasMeta =
    !!field.projectName || (field.categories && field.categories.length > 0);
  // 제목 = name||address. name 이 제목으로 올라가면 address 는 부제로 내려 정보 유지.
  const title = fieldTitle(field);
  const rawSubtitle = field.name?.trim()
    ? [field.address, field.addressDetail].filter(Boolean).join(' ')
    : field.addressDetail;
  // name 을 주소와 똑같이 저장한 현장이 실제로 있다 — 그대로 두면 카드에 같은 줄이
  // 두 번 찍힌다. 부제가 제목과 같으면 그리지 않는다.
  const subtitle = rawSubtitle?.trim() === title.trim() ? undefined : rawSubtitle;

  const content = (
    <>
      <View style={styles.titleRow}>
        <Text variant="body" weight="semibold" style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Badge
          label={FIELD_STATUS_LABEL[field.status]}
          tone={badge.tone}
          shape={badge.shape}
        />
      </View>
      {subtitle ? (
        <Text variant="bodySm" color="textMuted" style={styles.detail}>
          {subtitle}
        </Text>
      ) : null}
      {hasMeta ? (
        <View style={styles.metaRow}>
          {field.projectName ? (
            <View style={styles.metaItem}>
              <Ionicons name="folder-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.metaText}>
                {field.projectName}
              </Text>
            </View>
          ) : null}
          {field.categories && field.categories.length > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.metaText}>
                {field.categories.join(', ')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    // 표면은 Card 가 준다 (강령 7). 좌측 레일만 borderLeft 로 덮어쓴다 —
    // 별도 View 를 겹치면 카드 radius 를 따라가지 않아 모서리가 삐져나온다.
    <Card
      onPress={onPress}
      padding="lg"
      style={[
        styles.card,
        { borderLeftColor: statusColor },
        selected && styles.cardSelected,
      ]}
      accessibilityLabel={`${title}, ${FIELD_STATUS_LABEL[field.status]}`}
      accessibilityRole={showCheckbox ? 'checkbox' : 'button'}
      accessibilityState={showCheckbox ? { checked: !!selected } : undefined}
    >
      {showCheckbox ? (
        <View style={styles.checkRow}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.primary : colors.textMuted}
          />
          <View style={styles.checkBody}>{content}</View>
        </View>
      ) : (
        content
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    // 상태 레일 — 목록을 멀리서 훑을 때 색만으로 상태 분포가 보인다.
    // 색 단독 정보 전달은 아니다: 같은 카드 안 배지가 형상+라벨을 함께 준다.
    borderLeftWidth: 3,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkBody: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: { flex: 1 },
  detail: { marginTop: spacing.xs },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
  },
  metaText: { flexShrink: 1 },
});

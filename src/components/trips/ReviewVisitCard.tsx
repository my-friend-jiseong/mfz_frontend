import { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { SwipeRow, useSwipePressGuard } from '@/components/ui/SwipeRow';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { VISIT_STATUS_LABEL, type Visit } from '@/types/entities';
import type { VisitPhoto } from '@/api';
import { toAbsoluteFileUrl } from '@/api/config';
import { fieldDetailLine } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';
import { spacing, radius, touchTarget } from '@/theme/spacing';
import { duration, opacity } from '@/theme/motion';
import { fmtTime } from '@/utils/datetime';

interface Props {
  visit: Visit;
  order: number;
  fieldAddress: string;
  fieldAddressDetail?: string;
  memo?: string | null;
  photos?: readonly VisitPhoto[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * 외근 정리의 방문 카드 (명세 v2 FE-WRAP-02~04).
 * - 카드 또는 `⌄` 탭 → 요약 펼침(방문 수정 · 위치 · 사진 · 메모). 화살표는 위로 돈다.
 * - 왼쪽 스와이프 → `삭제`.
 * 여기서는 **읽기만** 한다(명세 §1.3) — 결과·사진·메모를 고치는 곳은 방문 수정 화면 하나다.
 */
export function ReviewVisitCard({
  visit,
  order,
  fieldAddress,
  fieldAddressDetail,
  memo,
  photos,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const badge = VISIT_STATUS_BADGE[visit.status];
  const detail = fieldDetailLine({ address: fieldAddress, addressDetail: fieldAddressDetail });
  const rotate = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotate, {
      toValue: expanded ? 1 : 0,
      duration: duration.base,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotate]);

  const photoList = photos ?? [];

  return (
    <View style={styles.wrap}>
      <SwipeRow onDelete={onDelete} deleteLabel="삭제">
        <Card padding="md">
          <GuardedPressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityHint="눌러서 방문 요약을 펼치거나 접습니다"
            style={({ pressed }) => [styles.head, pressed && { opacity: opacity.pressed }]}
          >
            <View style={styles.orderBadge}>
              <Text variant="bodySm" weight="bold" color="onPrimary" numeric>
                {order}
              </Text>
            </View>
            <View style={styles.headText}>
              <View style={styles.headTopRow}>
                <Text variant="bodySm" weight="bold" color="textMuted" numeric>
                  {fmtTime(visit.visitedAt)}
                </Text>
                <Badge
                  label={VISIT_STATUS_LABEL[visit.status]}
                  tone={badge.tone}
                  shape={badge.shape}
                  size="sm"
                />
              </View>
              <Text variant="body" weight="semibold" numberOfLines={1}>
                {fieldAddress}
              </Text>
              {detail ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {detail}
                </Text>
              ) : null}
            </View>
            <Animated.View
              style={{
                transform: [
                  { rotate: rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
                ],
              }}
            >
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Animated.View>
          </GuardedPressable>
        </Card>
      </SwipeRow>

      {expanded ? (
        <View style={styles.detail}>
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: opacity.pressed }]}
          >
            <Text variant="bodySm" weight="semibold" color="primary">
              방문 수정
            </Text>
          </Pressable>

          <Text variant="caption" weight="semibold" color="textMuted">
            위치
          </Text>
          <Text variant="bodySm">
            {detail ? `${fieldAddress} · ${detail}` : fieldAddress}
          </Text>

          <Text variant="caption" weight="semibold" color="textMuted">
            사진 ({photoList.length})
          </Text>
          {photoList.length > 0 ? (
            <View style={styles.photoRow}>
              {photoList.map((p) => (
                <Image
                  key={p.attachmentId}
                  source={{ uri: toAbsoluteFileUrl(p.fileUrl) }}
                  style={styles.photo}
                  accessibilityLabel="방문 사진"
                />
              ))}
            </View>
          ) : (
            <Text variant="bodySm" color="textSubtle">
              사진 없음
            </Text>
          )}

          <Text variant="caption" weight="semibold" color="textMuted">
            메모
          </Text>
          <Text variant="bodySm" color={memo ? 'text' : 'textSubtle'}>
            {memo || '메모 없음'}
          </Text>
          {visit.status === 'other' && visit.reason ? (
            <Text variant="caption" color="textMuted">
              기타 사유: {visit.reason}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// SwipeRow 안에서만 의미가 있다 — 스와이프를 끝내며 손을 뗀 탭이 펼침으로 새지 않게 거른다.
function GuardedPressable({ onPress, ...rest }: React.ComponentProps<typeof Pressable>) {
  const ignore = useSwipePressGuard();
  return (
    <Pressable
      {...rest}
      onPress={(e) => {
        if (ignore()) return;
        onPress?.(e);
      }}
    />
  );
}

const PHOTO_H = 72;

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 2 },
  headTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // 펼친 요약 — 카드 아래 별도 면. 왼쪽을 순번 배지 폭만큼 들여 카드 본문과 줄을 맞춘다(Figma pl 40).
  detail: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingLeft: spacing.md + 28,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  editBtn: {
    minHeight: touchTarget.control,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: {
    width: '31%',
    height: PHOTO_H,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

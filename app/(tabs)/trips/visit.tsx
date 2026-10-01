import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { visits as visitsApi, localizeError, toAbsoluteFileUrl } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import type { VisitDetailResponse } from '@/api';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtDateTime } from '@/utils/datetime';
import { memoForVisit } from '@/utils/visitRecord';
import { VISIT_STATUS_LABEL, normalizeVisitStatus } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

// 방문 상세 (명세 v2 §4.2) — 주소·결과·시각·메모·사진을 **읽기만** 한다. 추가 버튼 없음(FE-VIS-02).
// 시트는 55% 로 열어 남는 공간을 지도에 준다(FE-VIS-03).
export default function VisitDetail() {
  const router = useRouter();
  const { tripId, visitId } = useLocalSearchParams<{
    tripId: string;
    visitId: string;
  }>();

  const [data, setData] = useState<VisitDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visitInStore = useVisitStore((s) => s.getById)(visitId ?? '');
  const getField = useFieldStore((s) => s.getById);
  const loadFieldDetail = useFieldStore((s) => s.loadDetail);
  const fieldId = data?.fieldId ?? visitInStore?.fieldId ?? null;
  const attachments = useFieldStore((s) => (fieldId ? s.directAttachments[fieldId] : undefined));
  // 지도 스코프는 참조가 바뀌면 다시 그린다 — 매 렌더 새 배열을 넘기지 않게.
  const mapIds = useMemo(() => (fieldId ? [fieldId] : undefined), [fieldId]);

  useEffect(() => {
    if (!tripId || !visitId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await visitsApi.detail(tripId, visitId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(localizeError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, visitId]);

  useEffect(() => {
    if (fieldId) void loadFieldDetail(fieldId);
  }, [fieldId, loadFieldDetail]);

  if (loading) {
    return (
      <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)}>
        <LoadingState />
      </MapSheetLayout>
    );
  }

  if (error || !data) {
    return (
      <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)}>
        <EmptyState
          icon="alert-circle-outline"
          title="방문을 찾을 수 없습니다"
          description={error ?? undefined}
        />
      </MapSheetLayout>
    );
  }

  const status = normalizeVisitStatus(data.status);
  const badge = VISIT_STATUS_BADGE[status];
  const field = fieldId ? getField(fieldId) : undefined;
  const title = field?.address ?? data.siteName ?? '현장 방문';
  const reason = data.reason ?? visitInStore?.reason ?? null;
  const memo = memoForVisit(attachments, data.visitedAt);
  const photos = data.photos ?? [];

  return (
    <MapSheetLayout
      title="방문 상세"
      onBack={() => safeBack(router)}
      initialIndex={1}
      mapFieldIds={mapIds}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 이 화면이 답하는 것은 "이 방문이 어떻게 됐나" — 상태를 제목과 같은 줄에 둔다. */}
        <View style={styles.titleRow}>
          <Text variant="h2" weight="heavy" style={styles.title}>
            {title}
          </Text>
          <Badge label={VISIT_STATUS_LABEL[status]} tone={badge.tone} shape={badge.shape} size="md" />
        </View>
        <Text variant="bodySm" color="textMuted" numeric>
          방문 시각: {fmtDateTime(data.visitedAt)}
        </Text>
        {status === 'other' && reason ? (
          <Text variant="bodySm" color="textMuted">
            기타 사유: {reason}
          </Text>
        ) : null}

        <Text variant="caption" weight="semibold" color="textMuted" style={styles.section}>
          메모
        </Text>
        {memo?.text ? (
          <Card padding="md">
            <Text variant="bodySm">{memo.text}</Text>
            <Text variant="caption" color="textMuted" numeric style={styles.memoAt}>
              {fmtDateTime(memo.createdAt)}
            </Text>
          </Card>
        ) : (
          <Text variant="bodySm" color="textSubtle">
            메모 없음
          </Text>
        )}

        <Text variant="caption" weight="semibold" color="textMuted" style={styles.section}>
          사진 ({photos.length})
        </Text>
        {photos.length > 0 ? (
          <View style={styles.photoRow}>
            {photos.map((p) => (
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
      </ScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl * 3, gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { flex: 1 },
  section: { marginTop: spacing.lg },
  memoAt: { marginTop: spacing.xs },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: {
    width: '31%',
    // Figma photoGrid 칸 114×100.
    aspectRatio: 114 / 100,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});

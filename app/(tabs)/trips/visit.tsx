import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { visits as visitsApi, localizeError } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import type { VisitDetailResponse } from '@/api';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtDateTime } from '@/utils/datetime';
import {
  VISIT_STATUS_LABEL,
  normalizeVisitStatus,
} from '@/types/entities';
import { spacing } from '@/theme/spacing';

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
  const fieldId = data.fieldId ?? visitInStore?.fieldId ?? null;
  const siteName = data.siteName ?? (fieldId ? getField(fieldId)?.address : null);
  const reason = data.reason ?? visitInStore?.reason ?? null;

  return (
    <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)} initialIndex={2}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 이 화면에서 답해야 할 것은 "이 방문이 어떻게 됐나" 다 — 상태를 제목과 같은 줄에
            둬서 함께 읽히게 한다. 배지가 자기 줄을 통째로 차지하던 것을 접었다
            (FieldCard 에서 이미 같은 이유로 고친 패턴). */}
        <View style={styles.titleRow}>
          <Text variant="h2" weight="heavy" style={styles.title}>
            {siteName ?? '현장 방문'}
          </Text>
          <Badge
            label={VISIT_STATUS_LABEL[status]}
            tone={badge.tone}
            shape={badge.shape}
            size="md"
          />
        </View>
        <Text variant="bodySm" color="textMuted" numeric>
          방문 시각: {fmtDateTime(data.visitedAt)}
        </Text>

        {status === 'other' && reason ? (
          <Text variant="body" style={styles.reason}>
            사유: {reason}
          </Text>
        ) : null}

        {fieldId ? (
          <Button
            onPress={() => router.push(`/(tabs)/fields/${fieldId}` as never)}
            variant="secondary"
            fullWidth
            leftIcon="arrow-forward-circle"
            style={styles.toField}
          >
            메모·사진 추가
          </Button>
        ) : null}
      </ScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  // 간격 리듬 — 이전엔 제목·배지·시각·사유가 전부 sm 한 값이라 무엇이 한 덩어리인지
  // 눈이 읽지 못했다(2.1절). 제목+상태+시각은 한 덩어리(sm), 성격이 다른 사유는 md,
  // 그룹 밖인 이동 버튼은 xl.
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { flex: 1 },
  reason: { marginTop: spacing.md },
  toField: { marginTop: spacing.xl },
});
